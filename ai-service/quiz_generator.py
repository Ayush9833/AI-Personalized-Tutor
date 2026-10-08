import json
import os
import re
import time

from dotenv import load_dotenv
from google import genai

from rag import search_chunks


load_dotenv()


API_KEY = os.getenv("GEMINI_API_KEY")

if not API_KEY:
    raise RuntimeError(
        "GEMINI_API_KEY not found in ai-service/.env"
    )


client = genai.Client(api_key=API_KEY)
MODEL_NAME = "gemini-3.8-flash"


def clean_quiz_text(value):
    """
    Clean common encoding and spacing errors
    without splitting normal words.
    """

    if not isinstance(value, str):
        return value

    replacements = {
        "â€“": "-",
        "â€”": "-",
        "â€˜": "'",
        "â€™": "'",
        "â€œ": '"',
        "â€�": '"',
        "â€¦": "...",
        "Â": "",
        "con to ur": "contour",
        "denomina to r": "denominator",
        "simplyconnected": "simply connected",
        "respectto": "respect to",
        "alwayszero": "always zero",
        "anadditive": "an additive",
        "acomplex": "a complex",
        "thecon to ur": "the contour",
        "inthe": "in the",
        "fromthe": "from the",
        "tothe": "to the",
        "canbe": "can be",
        "areequal": "are equal",
        "partialderivatives": "partial derivatives",
        "complexanalysis": "complex analysis",
        "realpart": "real part",
        "imaginarypart": "imaginary part",
        "CauchyRiemann": "Cauchy-Riemann",

        # Common joined words from Gemini
        "fundamentaltrigonometric": "fundamental trigonometric",
        "trigonometricrelationships": "trigonometric relationships",
        "trigonometricidentity": "trigonometric identity",
        "trigonometricidentities": "trigonometric identities",
        "canfind": "can find",
        "itis": "it is",
        "PracticeProblem": "Practice Problem",
        "EngineeringMathematics": "Engineering Mathematics",
        "practicalB.Tech": "practical B.Tech",
        "studentsshould": "students should",
        "youcan": "you can",
        "wecan": "we can",
        "whichis": "which is",
        "thatcontains": "that contains",
        "thisis": "this is",
    }

    for old, new in replacements.items():
        value = value.replace(old, new)

    # Normalize new lines
    value = value.replace("\r\n", "\n")
    value = value.replace("\r", "\n")

    # Remove excessive tabs/spaces
    value = re.sub(
        r"[ \t]+",
        " ",
        value
    )

    # Remove spaces before punctuation
    value = re.sub(
        r"\s+([,.;:!?])",
        r"\1",
        value
    )

    # Add missing spaces after punctuation
    value = re.sub(
        r"([,;:])(?=\S)",
        r"\1 ",
        value
    )

    # Put a space before Step X:
    value = re.sub(
        r"(?<!\s)(Step \d+:)",
        r" \1",
        value
    )

    # Remove excessive spaces
    value = re.sub(
        r" {2,}",
        " ",
        value
    )

    return value.strip()


def difficulty_instructions(difficulty):

    if difficulty == "easy":
        return """
Create beginner-level questions.

Focus on:

- definitions
- direct substitution
- one-step calculations
- simple concepts

Use simple language and clear explanations.
"""

    if difficulty == "medium":
        return """
Create intermediate questions.

Use:

- calculations
- concept application
- two-step reasoning
- moderate mathematical reasoning

Avoid making every question a direct definition.
"""

    return """
Create genuinely hard B.Tech mathematics questions.

Requirements:

- At least 4 out of 5 questions must require calculation,
  derivation, verification, or multi-step application.
- Use different problem styles.
- Prefer calculations, Cauchy-Riemann equations,
  analytic functions, residues, Laurent series,
  contour integrals, or other advanced problems
  when supported by the requested concept.
- Do not use definition-only questions as hard questions.
- Independently solve every problem before selecting
  the correct answer.
- Check that correctAnswer exactly matches one option.
- Check every calculation in the explanation.
- Never include self-corrections.
- Never include uncertainty.
- Never include phrases such as:
  "Wait, let us re-verify"
  "Let's check the options"
  "Let us check the options"
  "Let's design a cleaner question"
  "I am not sure"
- If you cannot confidently solve a question,
  replace it with a simpler verified question
  on the same concept.
"""


def extract_json(text):
    """
    Extract JSON from Gemini response.
    """

    if not isinstance(text, str):
        raise ValueError(
            "AI response is not text."
        )

    text = text.strip()

    # Remove Markdown JSON code fences
    text = re.sub(
        r"^```(?:json)?\s*",
        "",
        text,
        flags=re.IGNORECASE
    )

    text = re.sub(
        r"\s*```$",
        "",
        text
    )

    # Find JSON object
    start = text.find("{")
    end = text.rfind("}")

    if start == -1 or end == -1 or end <= start:
        raise ValueError(
            "The AI did not return a valid JSON object."
        )

    json_text = text[start:end + 1]

    # Repair invalid backslash escapes
    json_text = re.sub(
        r'\\(?!["\\/bfnrtu])',
        r'\\',
        json_text
    )

    # Repair malformed \u sequences
    json_text = re.sub(
        r'\\u(?![0-9a-fA-F]{4})',
        r'\\u',
        json_text
    )

    try:
        return json.loads(json_text)

    except json.JSONDecodeError as error:
        raise ValueError(
            "Gemini returned malformed JSON: "
            + str(error)
        )


def validate_quiz(
    quiz,
    requested_count
):
    """
    Validate quiz structure and answer consistency.
    """

    if not isinstance(quiz, dict):
        raise ValueError(
            "Quiz response must be a JSON object."
        )

    questions = quiz.get("questions")

    if not isinstance(questions, list):
        raise ValueError(
            "The quiz must contain a questions array."
        )

    if len(questions) != requested_count:
        raise ValueError(
            f"Expected {requested_count} questions, "
            f"received {len(questions)}."
        )

    for index, question in enumerate(
        questions,
        start=1
    ):

        if not isinstance(question, dict):
            raise ValueError(
                f"Question {index} is not an object."
            )

        prompt = question.get("question")
        options = question.get("options")
        answer = question.get("correctAnswer")
        explanation = question.get("explanation")

        if not isinstance(prompt, str) or not prompt.strip():
            raise ValueError(
                f"Question {index} has no question text."
            )

        if not isinstance(options, list):
            raise ValueError(
                f"Question {index} options are invalid."
            )

        if len(options) != 4:
            raise ValueError(
                f"Question {index} must have exactly four options."
            )

        if any(
            not isinstance(option, str)
            or not option.strip()
            for option in options
        ):
            raise ValueError(
                f"Question {index} has an empty option."
            )

        if len(set(options)) != 4:
            raise ValueError(
                f"Question {index} contains duplicate options."
            )

        if (
            not isinstance(answer, str)
            or answer not in options
        ):
            raise ValueError(
                f"Question {index}: "
                f"correctAnswer must exactly match an option."
            )

        if (
            not isinstance(explanation, str)
            or not explanation.strip()
        ):
            raise ValueError(
                f"Question {index} has no explanation."
            )

        suspicious_phrases = [
            "wait, let us",
            "wait, let's",
            "let's re-verify",
            "let us re-verify",
            "let's check the options",
            "let us check the options",
            "let's design a cleaner",
            "let us design a cleaner",
            "i am not sure",
            "i'm not sure",
            "i am unsure",
            "i'm unsure",
            "however, let",
            "let me recheck",
            "let us recalculate",
            "let's recalculate",
        ]

        explanation_lower = explanation.lower()

        if any(
            phrase in explanation_lower
            for phrase in suspicious_phrases
        ):
            raise ValueError(
                f"Question {index} has an unfinished "
                f"or uncertain explanation."
            )

        cleaned_prompt = clean_quiz_text(prompt)

        cleaned_options = [
            clean_quiz_text(option)
            for option in options
        ]

        cleaned_explanation = clean_quiz_text(
            explanation
        )

        original_answer_index = options.index(
            answer
        )

        question["question"] = cleaned_prompt

        question["options"] = cleaned_options

        question["correctAnswer"] = (
            cleaned_options[
                original_answer_index
            ]
        )

        question["explanation"] = (
            cleaned_explanation
        )

    return quiz


def is_temporary_gemini_error(error):
    """
    Detect temporary Gemini errors such as:
    503 UNAVAILABLE
    429 RESOURCE_EXHAUSTED
    """

    error_text = str(error).lower()

    temporary_error_patterns = [
        "503",
        "unavailable",
        "high demand",
        "429",
        "resource_exhausted",
        "too many requests",
        "rate limit",
        "temporarily unavailable",
    ]

    return any(
        pattern in error_text
        for pattern in temporary_error_patterns
    )


def generate_quiz(
    course_id,
    concept,
    difficulty="medium",
    number_of_questions=5
):

    if not isinstance(
        number_of_questions,
        int
    ):
        raise ValueError(
            "number_of_questions must be an integer."
        )

    if not 1 <= number_of_questions <= 10:
        raise ValueError(
            "Generate between 1 and 10 questions."
        )

    if difficulty not in {
        "easy",
        "medium",
        "hard"
    }:
        raise ValueError(
            "Difficulty must be easy, medium, or hard."
        )

    # -------------------------------------------------
    # Search student's uploaded material
    # -------------------------------------------------

    chunks = search_chunks(
        concept,
        course_id,
        number_of_results=5
    )

    if chunks:

        context = "\n\n".join(
            chunks
        )

    else:

        context = (
            "No relevant uploaded course material "
            "was found."
        )

    # -------------------------------------------------
    # Prompt
    # -------------------------------------------------

    prompt = f"""
You are an expert B.Tech mathematics teacher
and assessment designer.

Create exactly {number_of_questions}
multiple-choice questions.

COURSE ID:

{course_id}

CONCEPT:

{concept}

DIFFICULTY:

{difficulty}

COURSE MATERIAL:

----------------

{context}

----------------

IMPORTANT SOURCE RULE:

Use the uploaded course material as the
primary source.

Do not claim that a fact comes from the
course material unless the retrieved
material supports it.

If the material does not contain enough
information for a question, do not invent
a fake course-material citation.

DIFFICULTY REQUIREMENTS:

{difficulty_instructions(difficulty)}

QUESTION RULES:

1. Every question must have exactly four
   distinct options.

2. Exactly one option must be correct.

3. correctAnswer must be copied exactly
   from the options array.

4. Solve each question independently
   before returning it.

5. Verify every mathematical step and
   final answer.

6. Explanations must be complete,
   readable, and mathematically consistent.

7. Never include drafts, discarded
   calculations, self-corrections,
   or contradictory statements.

8. Do not create questions that depend
   on missing diagrams.

9. Use the retrieved course material
   when relevant.

10. Do not repeat the same question
    in different wording.

11. Use normal English spacing and
    readable mathematical notation.

12. Do not write phrases such as:

    "Wait, let us re-verify"

    "Let's check the options"

    "Let us check the options"

    "Let's design a cleaner question"

    "I am not sure"

13. Before returning the JSON,
    independently verify every answer.

14. IMPORTANT JSON RULE:

    Do not use raw mathematical backslashes
    such as theta, sqrt, frac, or partial
    inside JSON strings.

    Prefer:

    theta
    sqrt(x)
    sin(theta)
    cos(theta)
    tan(theta)

Return ONLY valid JSON with this exact structure:

{{
  "concept": "{concept}",
  "difficulty": "{difficulty}",
  "questions": [
    {{
      "question": "Question text",
      "options": [
        "Option A",
        "Option B",
        "Option C",
        "Option D"
      ],
      "correctAnswer": "Exact text of the correct option",
      "explanation": "A complete step-by-step explanation with a verified result."
    }}
  ]
}}

Do not add Markdown code fences
or text outside the JSON.
"""

    # -------------------------------------------------
    # Quiz generation
    # -------------------------------------------------

    last_error = None

    for attempt in range(1, 4):

        print(
            f"Generating quiz... attempt {attempt}/3"
        )

        try:

            if attempt == 1:

                current_prompt = prompt

            else:

                current_prompt = prompt + f"""

IMPORTANT RETRY:

The previous generated quiz failed
validation.

Validation error:

{last_error}

Generate a completely NEW quiz.

Do not repeat the invalid question.

Do not include uncertain explanations.

Do not include self-corrections.

Do not include contradictory calculations.

Verify every mathematical calculation
before returning the JSON.

Return valid JSON only.
"""

            # -----------------------------------------
            # Gemini API call
            # -----------------------------------------

         
            response = client.models.generate_content(
                     model=MODEL_NAME,
                  contents=current_prompt
                      )
                          raw_text = response.text

                   
            if not raw_text:
                raise ValueError(
                    "AI returned an empty quiz response."
                )

            # -----------------------------------------
            # Parse JSON
            # -----------------------------------------

            quiz = extract_json(
                raw_text
            )

            quiz["concept"] = clean_quiz_text(
                quiz.get(
                    "concept",
                    concept
                )
            )

            quiz["difficulty"] = difficulty

            # -----------------------------------------
            # Validate quiz
            # -----------------------------------------

            validated_quiz = validate_quiz(
                quiz,
                number_of_questions
            )

            print(
                f"Quiz generated successfully "
                f"on attempt {attempt}."
            )

            return validated_quiz

        except Exception as error:

            last_error = error

            print(
                f"Quiz attempt {attempt} failed:"
            )

            print(
                str(error)
            )

            # -----------------------------------------
            # Temporary Gemini error
            # -----------------------------------------

            if is_temporary_gemini_error(error):

                if attempt < 3:

                    wait_seconds = 3 * (
                        2 ** (attempt - 1)
                    )

                    print(
                        f"Temporary Gemini error detected."
                    )

                    print(
                        f"Waiting {wait_seconds} seconds "
                        f"before retry..."
                    )

                    time.sleep(
                        wait_seconds
                    )

                    continue

                raise ValueError(
                    "Gemini is temporarily unavailable "
                    "after 3 attempts. "
                    "Please try again shortly."
                )

            # -----------------------------------------
            # Normal validation / JSON error
            # -----------------------------------------

            if attempt == 3:

                raise ValueError(
                    "Quiz generation failed after "
                    "3 attempts: "
                    + str(error)
                )

            time.sleep(2)

    raise ValueError(
        "Quiz generation failed: "
        + str(last_error)
    )


if __name__ == "__main__":

    print(
        "AI Quiz Generator"
    )

    print(
        "-----------------"
    )

    course_id = input(
        "Enter course ID: "
    ).strip()

    concept = input(
        "Enter concept: "
    ).strip()

    difficulty = input(
        "Enter difficulty (easy/medium/hard): "
    ).strip().lower()

    try:

        quiz = generate_quiz(
            course_id=course_id,
            concept=concept,
            difficulty=difficulty,
            number_of_questions=5
        )

        print(
            json.dumps(
                quiz,
                indent=2,
                ensure_ascii=False
            )
        )

    except Exception as error:

        print(
            f"Quiz generation failed: {error}"
        )