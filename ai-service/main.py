import os
import re
import json
import shutil
import subprocess
import tempfile

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, UploadFile, File, Form
from fastapi.responses import JSONResponse

import fitz
import pytesseract
from PIL import Image

from rag import add_chunks, search_chunks, delete_concept


app = FastAPI(
    title="AI Personalized Tutor AI Service",
    version="1.0.0"
)


# ============================================================
# TESSERACT CONFIGURATION
# ============================================================

pytesseract.pytesseract.tesseract_cmd = (
    r"C:\Program Files\Tesseract-OCR\tesseract.exe\tesseract.exe"
)


# ============================================================
# BASIC ROUTES
# ============================================================

@app.get("/")
def root():

    return {
        "message": "AI Personalized Tutor AI Service is running"
    }


@app.get("/health")
def health():

    return {
        "status": "OK",
        "message": "AI service is healthy"
    }


# ============================================================
# TEXT EXTRACTION FROM PDF
# ============================================================

def extract_pdf_text(pdf_path):

    """
    Extract text from PDF.

    First tries normal PDF text extraction.
    If a page contains little/no text, OCR is used.
    """

    document = fitz.open(pdf_path)

    pages = []

    # Temporary OCR directory
    os.makedirs("ocr_page", exist_ok=True)

    for page_number in range(len(document)):

        page = document[page_number]

        # ----------------------------------------------------
        # Try normal PDF text extraction
        # ----------------------------------------------------

        text = page.get_text("text").strip()

        # ----------------------------------------------------
        # If extracted text is insufficient, use OCR
        # ----------------------------------------------------

        if len(text) < 50:

            try:

                pix = page.get_pixmap(
                    matrix=fitz.Matrix(2, 2),
                    alpha=False
                )

                image_path = os.path.join(
                    "ocr_page",
                    f"page_{page_number + 1}.png"
                )

                pix.save(image_path)

                image = Image.open(image_path)

                text = pytesseract.image_to_string(
                    image
                ).strip()

                # Remove temporary OCR image
                try:
                    os.remove(image_path)
                except Exception:
                    pass

            except Exception as error:

                print(
                    f"OCR failed on page {page_number + 1}:",
                    error
                )

                text = ""

        # ----------------------------------------------------
        # Store page
        # ----------------------------------------------------

        if text:

            pages.append(
                f"[Page {page_number + 1}]\n{text}"
            )

    document.close()

    return "\n\n".join(pages)


# ============================================================
# CHUNK TEXT
# ============================================================

def create_chunks(text, chunk_size=1000, overlap=200):

    """
    Convert page-aware text into chunks.

    Example:

    [Page 1]
    text...

    [Page 2]
    text...
    """

    if not text:
        return []

    # --------------------------------------------------------
    # Split using page markers
    # --------------------------------------------------------

    pages = re.split(
        r"\[Page\s+(\d+)\]",
        text
    )

    chunks = []

    # re.split produces:
    # ["", "1", "page text", "2", "page text", ...]

    i = 1

    while i < len(pages):

        page_number = pages[i]

        page_text = ""

        if i + 1 < len(pages):

            page_text = pages[i + 1].strip()

        try:

            page_number = int(page_number)

        except Exception:

            page_number = 0

        if not page_text:

            i += 2
            continue

        # ----------------------------------------------------
        # Split page text into chunks
        # ----------------------------------------------------

        start = 0

        while start < len(page_text):

            end = start + chunk_size

            chunk_text = page_text[start:end].strip()

            if chunk_text:

                chunks.append(
                    {
                        "text": chunk_text,
                        "page": page_number
                    }
                )

            # ------------------------------------------------
            # Move forward while keeping overlap
            # ------------------------------------------------

            if end >= len(page_text):

                break

            start = end - overlap

        i += 2

    return chunks


# ============================================================
# PROCESS PDF
# ============================================================

@app.post("/process-pdf")
async def process_pdf(
    file: UploadFile = File(...),
    course_id: str = Form(...),
    concept: str = Form(...)
):

    temp_path = None

    try:

        # ----------------------------------------------------
        # Validate PDF
        # ----------------------------------------------------

        if not file.filename.lower().endswith(".pdf"):

            return JSONResponse(
                status_code=400,
                content={
                    "message": "Only PDF files are supported."
                }
            )

        # ----------------------------------------------------
        # Create temporary PDF
        # ----------------------------------------------------

        temp_dir = tempfile.mkdtemp()

        temp_path = os.path.join(
            temp_dir,
            file.filename
        )

        # ----------------------------------------------------
        # Save uploaded file
        # ----------------------------------------------------

        with open(temp_path, "wb") as buffer:

            shutil.copyfileobj(
                file.file,
                buffer
            )

        print(
            f"Processing PDF: {file.filename}"
        )

        # ----------------------------------------------------
        # Extract text
        # ----------------------------------------------------

        text = extract_pdf_text(
            temp_path
        )

        if not text.strip():

            return JSONResponse(
                status_code=400,
                content={
                    "message": "Could not extract text from PDF."
                }
            )

        print(
            f"Extracted characters: {len(text)}"
        )

        # ----------------------------------------------------
        # Create chunks
        # ----------------------------------------------------

        chunks = create_chunks(
            text,
            chunk_size=1000,
            overlap=200
        )

        print(
            f"Created chunks: {len(chunks)}"
        )

        if not chunks:

            return JSONResponse(
                status_code=400,
                content={
                    "message": "No chunks were created from the PDF."
                }
            )

        # ----------------------------------------------------
        # Store chunks in ChromaDB
        # ----------------------------------------------------

        added = add_chunks(
            chunks,
            course_id,
            concept
        )

        print(
            f"Added chunks to ChromaDB: {added}"
        )

        return {
            "message": "PDF processed successfully",
            "filename": file.filename,
            "course_id": course_id,
            "concept": concept,
            "characters": len(text),
            "chunks": len(chunks),
            "chunks_added": added
        }

    except Exception as error:

        print(
            "PDF processing error:",
            repr(error)
        )

        return JSONResponse(
            status_code=500,
            content={
                "message": "PDF processing failed",
                "error": str(error)
            }
        )

    finally:

        # ----------------------------------------------------
        # Delete temporary directory
        # ----------------------------------------------------

        if temp_path:

            try:

                temp_dir = os.path.dirname(
                    temp_path
                )

                if os.path.exists(temp_dir):

                    shutil.rmtree(
                        temp_dir,
                        ignore_errors=True
                    )

            except Exception:

                pass


# ============================================================
# CHUNK TEXT ENDPOINT
# ============================================================

@app.post("/chunk-text")
async def chunk_text(data: dict):

    try:

        text = data.get(
            "text",
            ""
        )

        if not text:

            return JSONResponse(
                status_code=400,
                content={
                    "message": "Text is required."
                }
            )

        chunks = create_chunks(
            text,
            chunk_size=1000,
            overlap=200
        )

        return {
            "chunks": chunks,
            "count": len(chunks)
        }

    except Exception as error:

        return JSONResponse(
            status_code=500,
            content={
                "message": "Chunking failed",
                "error": str(error)
            }
        )


# ============================================================
# SEARCH
# ============================================================

@app.get("/search")
def search(
    query: str,
    course_id: str,
    concept: str = None,
    number_of_results: int = 3
):

    try:

        results = search_chunks(
            query=query,
            course_id=course_id,
            concept=concept,
            number_of_results=number_of_results
        )

        return {
            "query": query,
            "course_id": course_id,
            "concept": concept,
            "results": results,
            "count": len(results)
        }

    except Exception as error:

        return JSONResponse(
            status_code=500,
            content={
                "message": "Search failed",
                "error": str(error)
            }
        )


# ============================================================
# ASK
# ============================================================

@app.get("/ask")
async def ask(
    query: str,
    course_id: str,
    concept: str = None
):

    try:

        results = search_chunks(
            query=query,
            course_id=course_id,
            concept=concept,
            number_of_results=5
        )

        if not results:

            return {
                "answer": (
                    "The uploaded material does not provide "
                    "enough information to answer this question."
                ),
                "sources": []
            }

        # ----------------------------------------------------
        # Build context
        # ----------------------------------------------------

        context = "\n\n".join(results)

        # ----------------------------------------------------
        # Gemini configuration
        # ----------------------------------------------------

        from google import genai

        api_key = os.getenv(
            "GEMINI_API_KEY"
        )

        if not api_key:

            return {
                "answer": (
                    "Relevant information was found, "
                    "but the Gemini API key is not configured."
                ),
                "sources": results
            }

        client = genai.Client(
            api_key=api_key
        )

        prompt = f"""
You are an AI Personalized Tutor.

Answer the student's question using ONLY the
provided study material.

If the answer is not present in the material,
clearly say that the uploaded material does not
contain enough information.

Explain the answer in simple language suitable
for a B.Tech CSE student.

Student question:

{query}

Study material:

{context}

Give a clear and educational answer.
"""

        response = client.models.generate_content(
            model="gemini-3.8-flash",
            contents=prompt
        )

        answer = response.text

        return {
            "answer": answer,
            "sources": results
        }

    except Exception as error:

        print(
            "Ask error:",
            repr(error)
        )

        return JSONResponse(
            status_code=500,
            content={
                "message": "AI answer generation failed",
                "error": str(error)
            }
        )


# ============================================================
# RECOMMEND
# ============================================================

@app.post("/recommend")
async def recommend(data: dict):

    try:

        # ----------------------------------------------------
        # Get recommendation data
        # ----------------------------------------------------

        course_id = data.get(
            "course_id",
            ""
        )

        concept = data.get(
            "concept",
            ""
        )

        mastery = data.get(
            "mastery",
            0
        )

        status = data.get(
            "status",
            "weak"
        )

        # ----------------------------------------------------
        # Validate course ID
        # ----------------------------------------------------

        if not course_id:

            return JSONResponse(
                status_code=400,
                content={
                    "message": "course_id is required."
                }
            )

        # ----------------------------------------------------
        # Validate concept
        # ----------------------------------------------------

        if not concept:

            return JSONResponse(
                status_code=400,
                content={
                    "message": "concept is required."
                }
            )

        # ----------------------------------------------------
        # Find relevant study material
        # ----------------------------------------------------

        results = search_chunks(
            query=concept,
            course_id=course_id,
            concept=concept,
            number_of_results=5
        )

        # ----------------------------------------------------
        # Convert mastery into number
        # ----------------------------------------------------

        try:

            mastery = float(mastery)

        except Exception:

            mastery = 0

        # ----------------------------------------------------
        # Generate recommendation priority
        # ----------------------------------------------------

        if mastery < 40:

            priority = "high"

            action = (
                "Study the fundamentals of this concept "
                "and then attempt a basic practice quiz."
            )

        elif mastery < 80:

            priority = "medium"

            action = (
                "Practice more questions on this concept "
                "and then attempt an intermediate quiz."
            )

        else:

            priority = "low"

            action = (
                "Review this concept with advanced questions "
                "or move to the next concept."
            )

        # ----------------------------------------------------
        # Return recommendation
        # ----------------------------------------------------

        return {

            "message": "Recommendation generated successfully",

            "course_id": course_id,

            "concept": concept,

            "mastery": mastery,

            "status": status,

            "priority": priority,

            "action": action,

            "study_material": results

        }

    except Exception as error:

        print(
            "Recommendation error:",
            repr(error)
        )

        return JSONResponse(
            status_code=500,
            content={
                "message": "Recommendation failed",
                "error": str(error)
            }
        )


# ============================================================
# GENERATE QUIZ
# ============================================================

@app.post("/generate-quiz")
async def generate_quiz(data: dict):

    try:

        course_id = data.get(
            "course_id",
            ""
        )

        concept = data.get(
            "concept",
            ""
        )

        difficulty = data.get(
            "difficulty",
            "medium"
        )

        number_of_questions = int(
            data.get(
                "number_of_questions",
                5
            )
        )

        # ----------------------------------------------------
        # Retrieve study material
        # ----------------------------------------------------

        results = search_chunks(
            query=concept,
            course_id=course_id,
            concept=concept,
            number_of_results=10
        )

        context = "\n\n".join(
            results
        )

        if not context:

            return JSONResponse(
                status_code=400,
                content={
                    "message": (
                        "No study material found "
                        "for this concept."
                    )
                }
            )

        # ----------------------------------------------------
        # Gemini
        # ----------------------------------------------------

        from google import genai

        api_key = os.getenv(
            "GEMINI_API_KEY"
        )

        if not api_key:

            return JSONResponse(
                status_code=500,
                content={
                    "message": (
                        "GEMINI_API_KEY is not configured."
                    )
                }
            )

        client = genai.Client(
            api_key=api_key
        )

        prompt = f"""
Generate a multiple-choice quiz for a B.Tech CSE student.

Concept:

{concept}

Difficulty:

{difficulty}

Number of questions:

{number_of_questions}

Use ONLY the provided study material.

Study material:

{context}

Return ONLY valid JSON.

Format:

{{
  "questions": [
    {{
      "question": "Question text",
      "options": [
        "Option A",
        "Option B",
        "Option C",
        "Option D"
      ],
      "correct_answer": "Option A"
    }}
  ]
}}
"""

        response = client.models.generate_content(
            model="gemini-3.8-flash",
            contents=prompt
        )

        generated_text = response.text.strip()

        # ----------------------------------------------------
        # Remove Markdown code fences if Gemini adds them
        # ----------------------------------------------------

        generated_text = re.sub(
            r"^```(?:json)?\s*",
            "",
            generated_text,
            flags=re.IGNORECASE
        )

        generated_text = re.sub(
            r"\s*```$",
            "",
            generated_text
        )

        quiz = json.loads(
            generated_text
        )

        return quiz

    except json.JSONDecodeError as error:

        return JSONResponse(
            status_code=500,
            content={
                "message": "Gemini returned invalid JSON",
                "error": str(error)
            }
        )

    except Exception as error:

        print(
            "Quiz generation error:",
            repr(error)
        )

        return JSONResponse(
            status_code=500,
            content={
                "message": "Quiz generation failed",
                "error": str(error)
            }
        )


# ============================================================
# DELETE CONCEPT
# ============================================================

@app.delete("/delete-concept")
def remove_concept(
    course_id: str,
    concept: str
):

    try:

        deleted = delete_concept(
            course_id,
            concept
        )

        return {
            "message": "Concept deleted successfully",
            "course_id": course_id,
            "concept": concept,
            "deleted_chunks": deleted
        }

    except Exception as error:

        return JSONResponse(
            status_code=500,
            content={
                "message": "Failed to delete concept",
                "error": str(error)
            }
        )


# ============================================================
# DEBUG METADATA
# ============================================================

@app.get("/debug-metadata")
def debug_metadata(
    course_id: str
):

    try:

        from rag import collection

        results = collection.get(
            where={
                "course_id": str(course_id)
            }
        )

        metadatas = results.get(
            "metadatas",
            []
        )

        return {
            "course_id": course_id,
            "count": len(metadatas),
            "metadata": metadatas
        }

    except Exception as error:

        return JSONResponse(
            status_code=500,
            content={
                "message": "Metadata debugging failed",
                "error": str(error)
            }
        )


# ============================================================
# STARTUP
# ============================================================

@app.on_event("startup")
def startup_event():

    print("=" * 60)

    print(
        "AI PERSONALIZED TUTOR AI SERVICE"
    )

    print("=" * 60)

    print(
        "Tesseract path:",
        pytesseract.pytesseract.tesseract_cmd
    )

    # --------------------------------------------------------
    # Verify Tesseract
    # --------------------------------------------------------

    try:

        version = subprocess.run(
            [
                pytesseract.pytesseract.tesseract_cmd,
                "--version"
            ],
            capture_output=True,
            text=True,
            timeout=10
        )

        print(
            "Tesseract detected successfully."
        )

        print(
            version.stdout.splitlines()[0]
            if version.stdout
            else version.stderr.splitlines()[0]
            if version.stderr
            else "Tesseract version detected."
        )

    except Exception as error:

        print(
            "WARNING: Tesseract verification failed:"
        )

        print(
            repr(error)
        )

    print("=" * 60)