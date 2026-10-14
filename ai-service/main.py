import io
import json
import logging
import os
import re
import shutil
import subprocess
import tempfile
import time
from typing import Optional

import fitz
import pytesseract
from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from PIL import Image
from pydantic import BaseModel, Field

from rag import add_chunks, search_chunks, delete_concept

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ai-personalized-tutor")

app = FastAPI(
    title="AI Personalized Tutor AI Service",
    version="2.0.1",
)

GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")

TESSERACT_PATH = os.getenv(
    "TESSERACT_PATH",
    r"C:\Program Files\Tesseract-OCR\tesseract.exe",
)

pytesseract.pytesseract.tesseract_cmd = TESSERACT_PATH


# ============================================================
# REQUEST MODELS
# ============================================================

class QuizRequest(BaseModel):
    course_id: str = Field(..., min_length=1)
    concept: str = Field(..., min_length=1)
    difficulty: str = "medium"
    number_of_questions: int = Field(default=5, ge=1, le=20)


class ChunkTextRequest(BaseModel):
    text: str = ""


class RecommendationRequest(BaseModel):
    course_id: str
    concept: str
    status: str = "weak"
    mastery: float = 0


# ============================================================
# HELPER FUNCTIONS
# ============================================================

def error_response(message, error, status_code=500):
    return JSONResponse(
        status_code=status_code,
        content={
            "message": message,
            "error": str(error),
        },
    )


def format_context(results):
    """Convert retrieved study material into readable text."""
    if not results:
        return ""

    if isinstance(results, str):
        return results.strip()

    formatted = []

    if isinstance(results, dict):
        documents = results.get("documents")

        if isinstance(documents, list):
            for entry in documents:
                if isinstance(entry, list):
                    formatted.extend(
                        str(item) for item in entry if item
                    )
                elif entry:
                    formatted.append(str(entry))
        else:
            value = results.get(
                "text",
                results.get("content", results.get("document", "")),
            )
            if value:
                formatted.append(str(value))

    elif isinstance(results, list):
        for item in results:
            if isinstance(item, str):
                if item.strip():
                    formatted.append(item.strip())

            elif isinstance(item, dict):
                value = item.get(
                    "text",
                    item.get("content", item.get("document", "")),
                )
                if value:
                    formatted.append(str(value).strip())

            elif item is not None:
                formatted.append(str(item))

    else:
        formatted.append(str(results))

    return "\n\n".join(
        part for part in formatted if part.strip()
    )


def get_gemini_client():
    from google import genai

    api_key = os.getenv("GEMINI_API_KEY")

    if not api_key:
        raise ValueError(
            "GEMINI_API_KEY is missing. Add it to your .env file."
        )

    return genai.Client(api_key=api_key)



def generate_gemini_content(prompt, retries=3):
    client = get_gemini_client()

    # Primary model followed by optional fallback models.
    fallback_models = [
        model.strip()
        for model in os.getenv(
            "GEMINI_FALLBACK_MODELS", ""
        ).split(",")
        if model.strip()
    ]

    models_to_try = list(dict.fromkeys(
        [GEMINI_MODEL] + fallback_models
    ))

    last_error = None

    for model in models_to_try:
        for attempt in range(retries):
            try:
                logger.info(
                    "Generating content with model=%s, attempt=%s",
                    model,
                    attempt + 1,
                )

                response = client.models.generate_content(
                    model=model,
                    contents=prompt,
                )

                if not response or not getattr(response, "text", None):
                    raise ValueError(
                        "Gemini returned an empty response."
                    )

                return response.text.strip()

            except Exception as error:
                last_error = error
                message = str(error).upper()

                temporary_error = any(
                    term in message
                    for term in (
                        "503",
                        "UNAVAILABLE",
                        "HIGH DEMAND",
                        "RESOURCE_EXHAUSTED",
                        "429",
                        "500",
                        "INTERNAL SERVER ERROR",
                        "TIMEOUT",
                    )
                )

                if not temporary_error:
                    raise

                if attempt < retries - 1:
                    wait_seconds = 2 ** (attempt + 1)

                    logger.warning(
                        "Temporary error on %s. "
                        "Retrying in %s seconds: %s",
                        model,
                        wait_seconds,
                        error,
                    )
                    time.sleep(wait_seconds)
                else:
                    logger.warning(
                        "Retries exhausted for model=%s",
                        model,
                    )

    raise RuntimeError(
        "All configured Gemini models failed. "
        f"Last error: {last_error}"
    ) from last_error




def parse_json_response(text):
    """Parse JSON even when Gemini wraps it in Markdown fences."""
    if not text:
        raise ValueError("Gemini returned an empty response.")

    cleaned = text.strip()

    cleaned = re.sub(
        r"^\s*```(?:json)?\s*",
        "",
        cleaned,
        flags=re.IGNORECASE,
    )

    cleaned = re.sub(
        r"\s*```\s*$",
        "",
        cleaned,
    )

    try:
        return json.loads(cleaned)

    except json.JSONDecodeError:
        start = cleaned.find("{")
        end = cleaned.rfind("}")

        if start != -1 and end > start:
            return json.loads(cleaned[start:end + 1])

        raise


def normalize_generated_questions(raw_questions, requested_count):
    """Validate quiz questions and normalize the answer format."""
    if not isinstance(raw_questions, list):
        raise ValueError(
            "Gemini response must contain a questions array."
        )

    validated = []

    for index, question in enumerate(raw_questions):
        if not isinstance(question, dict):
            logger.warning(
                "Skipping malformed question at index %s.",
                index,
            )
            continue

        question_text = question.get("question")
        raw_options = question.get("options")

        if not isinstance(question_text, str):
            continue

        question_text = question_text.strip()

        if isinstance(raw_options, dict):
            options = [
                raw_options.get("A"),
                raw_options.get("B"),
                raw_options.get("C"),
                raw_options.get("D"),
            ]
        elif isinstance(raw_options, list):
            options = raw_options
        else:
            continue

        if (
            not question_text
            or len(options) != 4
            or any(
                not isinstance(option, str) or not option.strip()
                for option in options
            )
        ):
            continue

        options = [option.strip() for option in options]

        if len({option.casefold() for option in options}) != 4:
            continue

        raw_answer = (
            question.get("correct_answer")
            or question.get("correctAnswer")
        )

        if not isinstance(raw_answer, str) or not raw_answer.strip():
            continue

        answer = raw_answer.strip()

        if answer.upper() in ("A", "B", "C", "D"):
            correct_answer = options[
                ("A", "B", "C", "D").index(answer.upper())
            ]
        else:
            correct_answer = next(
                (
                    option
                    for option in options
                    if option.casefold() == answer.casefold()
                ),
                None,
            )

            if correct_answer is None:
                logger.warning(
                    "Skipping question %s: answer does not match an option.",
                    index + 1,
                )
                continue

        validated.append({
            "question": question_text,
            "options": options,
            "correct_answer": correct_answer,
            "explanation": str(
                question.get("explanation") or ""
            ).strip(),
        })

    if len(validated) < requested_count:
        raise ValueError(
            f"Gemini returned only {len(validated)} valid questions; "
            f"{requested_count} were requested."
        )

    return validated[:requested_count]

# ---------------------------------------------------------------------
# Basic routes
# ---------------------------------------------------------------------
@app.get("/")
def root():
    return {
        "message": "AI Personalized Tutor AI Service is running",
        "status": "OK",
    }


@app.get("/health")
def health():
    return {
        "status": "OK",
        "message": "AI service is healthy",
        "model": GEMINI_MODEL,
    }


# ---------------------------------------------------------------------
# PDF extraction and OCR
# ---------------------------------------------------------------------
def extract_pdf_text(pdf_path):
    pages = []

    with fitz.open(pdf_path) as document:
        for page_number, page in enumerate(document, start=1):
            text = page.get_text("text").strip()

            # Use OCR when the PDF page contains little or no text.
            if len(text) < 50:
                try:
                    pix = page.get_pixmap(
                        matrix=fitz.Matrix(2, 2),
                        alpha=False,
                    )
                    image_bytes = pix.tobytes("png")

                    with Image.open(io.BytesIO(image_bytes)) as image_obj:
                        text = pytesseract.image_to_string(image_obj).strip()

                except Exception as error:
                    logger.warning(
                        "OCR failed on page %s: %s",
                        page_number,
                        error,
                    )

            if text:
                pages.append(f"[Page {page_number}]\n{text}")

    return "\n\n".join(pages)


# ---------------------------------------------------------------------
# Text chunking
# ---------------------------------------------------------------------
def create_chunks(text, chunk_size=1000, overlap=200):
    if not text or not text.strip():
        return []

    if chunk_size <= 0:
        raise ValueError("chunk_size must be greater than zero.")

    if overlap < 0 or overlap >= chunk_size:
        raise ValueError(
            "overlap must be non-negative and smaller than chunk_size."
        )

    parts = re.split(r"\[Page\s+(\d+)\]", text)
    pages = []

    if len(parts) > 1:
        i = 1

        while i + 1 < len(parts):
            try:
                page_number = int(parts[i])
            except ValueError:
                page_number = 0

            pages.append((page_number, parts[i + 1].strip()))
            i += 2
    else:
        pages.append((1, text.strip()))

    chunks = []
    step = chunk_size - overlap

    for page_number, page_text in pages:
        if not page_text:
            continue

        start = 0

        while start < len(page_text):
            chunk_text = page_text[start:start + chunk_size].strip()

            if chunk_text:
                chunks.append({
                    "text": chunk_text,
                    "page": page_number,
                })

            if start + chunk_size >= len(page_text):
                break

            start += step

    return chunks


# ---------------------------------------------------------------------
# Process PDF
# ---------------------------------------------------------------------
@app.post("/process-pdf")
async def process_pdf(
    file: UploadFile = File(...),
    course_id: str = Form(...),
    concept: str = Form(...),
):
    temp_dir = None

    try:
        if not file.filename or not file.filename.lower().endswith(".pdf"):
            return JSONResponse(
                status_code=400,
                content={"message": "Only PDF files are supported."},
            )

        course_id = course_id.strip()
        concept = concept.strip()

        if not course_id or not concept:
            return JSONResponse(
                status_code=400,
                content={
                    "message": "course_id and concept are required."
                },
            )

        temp_dir = tempfile.mkdtemp()
        temp_path = os.path.join(temp_dir, "uploaded.pdf")

        with open(temp_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        logger.info("Processing PDF: %s", file.filename)

        text = extract_pdf_text(temp_path)

        if not text.strip():
            return JSONResponse(
                status_code=400,
                content={
                    "message": (
                        "Could not extract text from PDF. Check that the PDF "
                        "is readable and OCR is installed."
                    )
                },
            )

        chunks = create_chunks(text)

        if not chunks:
            return JSONResponse(
                status_code=400,
                content={
                    "message": "No chunks were created from the PDF."
                },
            )

        added = add_chunks(chunks, course_id, concept)

        logger.info("Extracted characters: %s", len(text))
        logger.info("Created chunks: %s", len(chunks))
        logger.info("Added chunks to ChromaDB: %s", added)

        return {
            "message": "PDF processed successfully",
            "filename": file.filename,
            "course_id": course_id,
            "concept": concept,
            "characters": len(text),
            "chunks": len(chunks),
            "chunks_added": added,
        }

    except Exception as error:
        logger.exception("PDF processing failed")
        return error_response("PDF processing failed", error)

    finally:
        if temp_dir:
            shutil.rmtree(temp_dir, ignore_errors=True)

        await file.close()


# ---------------------------------------------------------------------
# Chunk text endpoint
# ---------------------------------------------------------------------
@app.post("/chunk-text")
async def chunk_text(data: ChunkTextRequest):
    try:
        if not data.text.strip():
            return JSONResponse(
                status_code=400,
                content={"message": "Text is required."},
            )

        chunks = create_chunks(data.text)

        return {
            "chunks": chunks,
            "count": len(chunks),
        }

    except Exception as error:
        logger.exception("Chunking failed")
        return error_response("Chunking failed", error)


# ---------------------------------------------------------------------
# Search study material
# ---------------------------------------------------------------------
@app.get("/search")
def search(
    query: str,
    course_id: str,
    concept: Optional[str] = None,
    number_of_results: int = 3,
):
    try:
        if not query.strip() or not course_id.strip():
            return JSONResponse(
                status_code=400,
                content={
                    "message": "query and course_id are required."
                },
            )

        if number_of_results < 1:
            return JSONResponse(
                status_code=400,
                content={
                    "message": "number_of_results must be at least 1."
                },
            )

        results = search_chunks(
            query=query,
            course_id=course_id,
            concept=concept,
            number_of_results=number_of_results,
        )

        return {
            "query": query,
            "course_id": course_id,
            "concept": concept,
            "results": results,
            "count": len(results) if results is not None else 0,
        }

    except Exception as error:
        logger.exception("Search failed")
        return error_response("Search failed", error)


# ---------------------------------------------------------------------
# Ask AI using uploaded study material
# ---------------------------------------------------------------------
@app.get("/ask")
async def ask(
    query: str,
    course_id: str,
    concept: Optional[str] = None,
):
    try:
        results = search_chunks(
            query=query,
            course_id=course_id,
            concept=concept,
            number_of_results=5,
        )

        context = format_context(results)

        if not context:
            return {
                "answer": (
                    "No relevant study material was found. "
                    "Please upload the relevant study material first."
                ),
                "sources": [],
            }

        prompt = f"""
You are an AI Personalized Tutor for a B.Tech CSE student.
Answer the student's question using the uploaded study material
as the primary source.

Explain concepts clearly. Do not claim the uploaded material says
something it does not.

Student question:
{query}

Study material:
{context}

Give a clear, accurate and well-structured answer.
"""

        answer = generate_gemini_content(prompt)

        return {
            "answer": answer,
            "sources": results,
        }

    except Exception as error:
        logger.exception("AI answer generation failed")
        return error_response("AI answer generation failed", error)


# ---------------------------------------------------------------------
# Recommendations
# ---------------------------------------------------------------------
@app.post("/recommend")
async def recommend(data: RecommendationRequest):
    try:
        course_id = data.course_id.strip()
        concept = data.concept.strip()

        if not course_id:
            return JSONResponse(
                status_code=400,
                content={"message": "course_id is required."},
            )

        if not concept:
            return JSONResponse(
                status_code=400,
                content={"message": "concept is required."},
            )

        mastery = max(0.0, min(100.0, float(data.mastery)))

        results = search_chunks(
            query=concept,
            course_id=course_id,
            concept=concept,
            number_of_results=5,
        )

        if mastery < 40:
            priority = "high"
            action = (
                "Study the fundamentals of this concept and then "
                "attempt a basic practice quiz."
            )
        elif mastery < 80:
            priority = "medium"
            action = (
                "Practice more questions on this concept and then "
                "attempt an intermediate quiz."
            )
        else:
            priority = "low"
            action = (
                "Review this concept with advanced questions or "
                "move to the next concept."
            )

        return {
            "message": "Recommendation generated successfully",
            "course_id": course_id,
            "concept": concept,
            "mastery": mastery,
            "status": data.status,
            "priority": priority,
            "action": action,
            "study_material": results,
        }

    except Exception as error:
        logger.exception("Recommendation failed")
        return error_response("Recommendation failed", error)


# ---------------------------------------------------------------------
# Part 3 starts with the /generate-quiz endpoint.
# Paste Part 3 directly below this section.
# ---------------------------------------------------------------------

# ---------------------------------------------------------------------
# Generate quiz
# ---------------------------------------------------------------------
@app.post("/generate-quiz")
async def generate_quiz(data: QuizRequest):
    try:
        course_id = data.course_id.strip()
        concept = data.concept.strip()
        difficulty = data.difficulty.strip().lower()
        number_of_questions = data.number_of_questions

        if not course_id:
            return JSONResponse(
                status_code=400,
                content={"message": "course_id is required."},
            )

        if not concept:
            return JSONResponse(
                status_code=400,
                content={"message": "concept is required."},
            )

        if difficulty not in ("easy", "medium", "hard"):
            return JSONResponse(
                status_code=400,
                content={
                    "message": "difficulty must be easy, medium, or hard."
                },
            )

        logger.info(
            "Quiz request: course=%s concept=%s difficulty=%s count=%s",
            course_id,
            concept,
            difficulty,
            number_of_questions,
        )

        # Retrieve relevant study material exactly once.
        results = search_chunks(
            query=concept,
            course_id=course_id,
            concept=concept,
            number_of_results=10,
        )

        context = format_context(results)

        logger.info(
            "Quiz retrieval: course_id=%r concept=%r",
            course_id,
            concept,
        )
        logger.info(
            "Quiz retrieval result type=%s count=%s",
            type(results).__name__,
            len(results) if results else 0,
        )
        logger.info(
            "Quiz context length=%s preview=%r",
            len(context),
            context[:300],
        )

        if not context.strip():
            return JSONResponse(
                status_code=400,
                content={
                    "message": (
                        "No study material found for this course and concept. "
                        "Upload and process a relevant PDF first."
                    ),
                    "course_id": course_id,
                    "concept": concept,
                    "retrieved_results": (
                        len(results) if results else 0
                    ),
                },
            )

        prompt = f"""
You are an expert educational quiz generator for a B.Tech CSE student.
Generate exactly {number_of_questions} multiple-choice questions.

CONCEPT:
{concept}

DIFFICULTY:
{difficulty}

RULES:
1. Base questions on the supplied study material.
2. Do not invent facts that contradict the study material.
3. Each question must have exactly four distinct options.
4. There must be exactly one correct option per question.
5. The correct_answer must exactly match one option's full text.
6. Questions must be clear and non-duplicative.
7. Return JSON only. Do not include Markdown or introductory text.

Required JSON structure:
{{
  "questions": [
    {{
      "question": "Question text",
      "options": [
        "First option",
        "Second option",
        "Third option",
        "Fourth option"
      ],
      "correct_answer": "First option",
      "explanation": "Brief explanation of the correct answer"
    }}
  ]
}}

STUDY MATERIAL:
{context}
"""

        generated_text = generate_gemini_content(prompt)

        try:
            quiz_data = parse_json_response(generated_text)
        except (json.JSONDecodeError, ValueError) as error:
            logger.error(
                "Gemini returned invalid quiz JSON: %s",
                generated_text[:1000],
            )
            return JSONResponse(
                status_code=502,
                content={
                    "message": "Gemini returned invalid quiz JSON.",
                    "error": str(error),
                },
            )

        if not isinstance(quiz_data, dict):
            return JSONResponse(
                status_code=502,
                content={
                    "message": (
                        "Gemini returned an unexpected quiz format."
                    )
                },
            )

        try:
            questions = normalize_generated_questions(
                quiz_data.get("questions"),
                number_of_questions,
            )
        except ValueError as error:
            logger.error("Quiz validation failed: %s", error)
            return JSONResponse(
                status_code=502,
                content={
                    "message": (
                        "Gemini returned invalid quiz questions."
                    ),
                    "error": str(error),
                },
            )

        logger.info(
            "Quiz generated successfully: %s questions",
            len(questions),
        )

        return {"questions": questions}

    except HTTPException:
        raise

    except Exception as error:
        logger.exception("Quiz generation failed")

        message = str(error)
        upper_message = message.upper()

        if "GEMINI_API_KEY IS MISSING" in upper_message:
            return JSONResponse(
                status_code=500,
                content={
                    "message": (
                        "Gemini API key is missing. "
                        "Configure GEMINI_API_KEY in the .env file."
                    )
                },
            )

        if any(
            term in upper_message
            for term in (
                "429",
                "RESOURCE_EXHAUSTED",
                "QUOTA",
                "RATE LIMIT",
            )
        ):
            return JSONResponse(
                status_code=503,
                content={
                    "message": (
                        "Gemini API quota or rate limit reached. "
                        "Wait before retrying or check your Gemini API quota."
                    )
                },
            )

        if any(
            term in upper_message
            for term in ("503", "UNAVAILABLE", "HIGH DEMAND")
        ):
            return JSONResponse(
                status_code=503,
                content={
                    "message": (
                        "Gemini is temporarily unavailable. "
                        "Please try again shortly."
                    )
                },
            )

        return JSONResponse(
            status_code=500,
            content={
                "message": "Quiz generation failed.",
                "error": message,
            },
        )


# ---------------------------------------------------------------------
# Delete concept
# ---------------------------------------------------------------------
@app.delete("/delete-concept")
def remove_concept(course_id: str, concept: str):
    try:
        deleted = delete_concept(course_id, concept)

        return {
            "message": "Concept deleted successfully",
            "course_id": course_id,
            "concept": concept,
            "deleted_chunks": deleted,
        }

    except Exception as error:
        logger.exception("Delete concept failed")
        return error_response("Failed to delete concept", error)


# ---------------------------------------------------------------------
# Debug metadata
# ---------------------------------------------------------------------
@app.get("/debug-metadata")
def debug_metadata(course_id: str):
    try:
        from rag import collection

        results = collection.get(
            where={"course_id": str(course_id)}
        )

        metadatas = results.get("metadatas") or []

        return {
            "course_id": course_id,
            "count": len(metadatas),
            "metadata": metadatas,
        }

    except Exception as error:
        logger.exception("Metadata debugging failed")
        return error_response("Metadata debugging failed", error)


# ---------------------------------------------------------------------
# Startup diagnostics
# ---------------------------------------------------------------------
@app.on_event("startup")
def startup_event():
    logger.info("=" * 60)
    logger.info("AI PERSONALIZED TUTOR AI SERVICE")
    logger.info("=" * 60)
    logger.info("Gemini model: %s", GEMINI_MODEL)
    logger.info("Tesseract path: %s", TESSERACT_PATH)

    try:
        version = subprocess.run(
            [TESSERACT_PATH, "--version"],
            capture_output=True,
            text=True,
            timeout=10,
            check=True,
        )

        version_text = (
            version.stdout or version.stderr
        ).splitlines()

        logger.info(
            "Tesseract detected: %s",
            version_text[0] if version_text else "Version detected",
        )

    except Exception as error:
        logger.warning(
            "Tesseract verification failed: %s",
            error,
        )
        logger.warning(
            "Selectable-text PDFs can still work. OCR requires Tesseract."
        )

    logger.info("AI service startup complete.")
    logger.info("=" * 60)