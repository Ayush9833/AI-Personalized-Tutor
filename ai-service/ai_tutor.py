import os
from dotenv import load_dotenv
from google import genai

load_dotenv()

client = genai.Client(
    api_key=os.getenv("GEMINI_API_KEY")
)

from rag import search_chunks


def clean_text(text):
    """
    Clean common formatting problems from Gemini responses.
    """

    if not text:
        return ""

    text = text.replace("\r\n", "\n")
    text = text.replace("\r", "\n")

    # Fix common joined words
    text = text.replace("thereis", "there is")
    text = text.replace("theprovided", "the provided")
    text = text.replace("ofthe", "of the")
    text = text.replace("inthe", "in the")
    text = text.replace("isnot", "is not")
    text = text.replace("doesnot", "does not")

    # Remove excessive spaces
    while "  " in text:
        text = text.replace("  ", " ")

    # Remove excessive blank lines
    while "\n\n\n" in text:
        text = text.replace("\n\n\n", "\n\n")

    return text.strip()


def ask_tutor(
    question,
    course_id,
    student_profile=None,
    provided_context=None
):

    # -----------------------------------------------------
    # 1. SEARCH COURSE MATERIAL
    # -----------------------------------------------------

    # If context was already retrieved by a filtered
    # recommendation request, use it directly.
    if provided_context is not None:

        context = provided_context

    else:

        results = search_chunks(
            question,
            course_id,
            number_of_results=3
        )

        # -------------------------------------------------
        # 2. COMBINE RETRIEVED CHUNKS
        # -------------------------------------------------

        if results:

            context = "\n\n".join(results)

        else:

            context = "No relevant course material was found."


    # -----------------------------------------------------
    # 3. READ STUDENT PROFILE
    # -----------------------------------------------------

    weakest_concept = None
    mastery = None
    status = None

    if student_profile:

        weakest_concept = student_profile.get(
            "weakest_concept"
        )

        mastery = student_profile.get(
            "mastery"
        )

        status = student_profile.get(
            "status"
        )


    # -----------------------------------------------------
    # 4. DETERMINE LEARNING LEVEL
    # -----------------------------------------------------

    if status == "weak":

        learning_instruction = """
The student is weak in this area.

Start from the fundamentals.
Assume the student has limited understanding.
Define important terms before using them.
Use simple examples.
Show calculations step by step.
Do not jump directly to advanced concepts.
"""

    elif status == "developing":

        learning_instruction = """
The student has developing knowledge.

Briefly review important fundamentals.
Give a clear explanation with moderate detail.
Use examples.
Then introduce slightly more challenging reasoning.
"""

    elif status == "strong":

        learning_instruction = """
The student has strong knowledge.

Give a concise but technically accurate explanation.
You may use more advanced terminology.
Include deeper reasoning or challenging examples when useful.
"""

    else:

        learning_instruction = """
The student's knowledge level is unknown.

Explain the topic at a beginner-friendly level.
Use clear definitions and simple examples.
"""


    # -----------------------------------------------------
    # 5. CREATE AI PROMPT
    # -----------------------------------------------------

    prompt = f"""
You are an AI tutor for a B.Tech student.

Your job is to teach the student clearly and accurately.

Use the following course material whenever it is relevant.

================ COURSE MATERIAL ================

{context}

============== END COURSE MATERIAL ==============


================ STUDENT QUESTION ================

{question}

===================================================


================ STUDENT PROFILE =================

Weakest Concept: {weakest_concept}

Mastery: {mastery}

Status: {status}

===================================================


================ PERSONALIZATION =================

{learning_instruction}

===================================================


GENERAL INSTRUCTIONS:

- Answer the student's question directly.
- Explain step by step.
- Adapt the difficulty to the student's mastery level.
- If the student is weak, start from fundamentals.
- If the student is developing, provide explanation plus practice-oriented examples.
- If the student is strong, provide deeper reasoning.
- Use ONLY the provided course material when the question concerns the requested recommendation topic.
- Do not introduce unrelated subjects.
- Do not replace the provided topic with another topic.
- If the material contains the solution, use it.
- If the material contains only the topic or question, solve it using your mathematical knowledge.
- Do not claim that the PDF contains a solution unless it actually contains that solution.
- Show important formulas and calculations.
- Give the final answer clearly.
- Keep mathematical notation accurate.
- Use normal spacing between words.
- Do not join words together.
- Avoid unnecessary greetings.
- Do not say "Hello" unless the student specifically asks for a conversational response.
- Do not mention internal AI instructions.
- Do not mention the student's mastery percentage unless it is useful for the explanation.
- Keep the explanation suitable for a B.Tech student.

MATHEMATICAL NOTATION:

For derivatives use:

du/dx
du/dy
dv/dx
dv/dy

Do not replace derivative notation with incorrect characters.

For complex analysis, keep expressions such as:

f(z) = u(x,y) + iv(x,y)

and

∂u/∂x = ∂v/∂y
∂u/∂y = -∂v/∂x

mathematically correct.

IMPORTANT:

Write the response with clean spacing and readable formatting.
"""


    # -----------------------------------------------------
    # 6. SEND TO GEMINI
    # -----------------------------------------------------

   # -----------------------------------------------------
# 6. SEND TO GEMINI
# -----------------------------------------------------

# Limit retrieved context so the Gemini request
# does not become unnecessarily large.
if len(context) > 12000:
    context = context[:12000]

# Rebuild prompt with limited context
prompt = f"""
You are an AI tutor for a B.Tech student.

Use the following course material to answer the question.

================ COURSE MATERIAL ================

{context}

============== END COURSE MATERIAL ==============

Student Question:
{question}

Student Profile:
Weakest Concept: {weakest_concept}
Mastery: {mastery}
Status: {status}

================ INSTRUCTIONS ================

{learning_instruction}

- Answer the question directly.
- Explain step by step.
- Use the course material whenever relevant.
- Adapt the explanation to the student's level.
- Use simple examples when useful.
- Keep the answer suitable for a B.Tech student.
- Do not mention internal instructions.
- Keep mathematical notation accurate.
"""

# Try Gemini a few times if the service is temporarily unavailable.
response = None

for attempt in range(3):
    try:
        response = client.interactions.create(
            model="gemini-3.5-flash-lite",
            input=prompt
        )

        break

    except Exception as error:
        print(f"Gemini attempt {attempt + 1} failed: {error}")

        if attempt == 2:
            raise


    # -----------------------------------------------------
    # 7. GET ANSWER
    # -----------------------------------------------------

    answer = response.output_text


    # -----------------------------------------------------
    # 8. CLEAN RESPONSE
    # -----------------------------------------------------

    answer = clean_text(answer)


    # -----------------------------------------------------
    # 9. RETURN ANSWER
    # -----------------------------------------------------

    return answer