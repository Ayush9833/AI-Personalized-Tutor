import fitz
from rag import add_chunks


# ==========================================
# PDF location
# ==========================================

PDF_PATH = "../backend/uploads/1790885600422-798983705.pdf"


# ==========================================
# Course ID
# ==========================================

COURSE_ID = "6abe9ed2ed721fbe3c2567d1"


# ==========================================
# Read PDF
# ==========================================

document = fitz.open(PDF_PATH)

full_text = ""

for page in document:
    full_text += page.get_text()

document.close()


# ==========================================
# Clean text
# ==========================================

full_text = " ".join(full_text.split())


# ==========================================
# Create chunks
# ==========================================

chunk_size = 1000
overlap = 200

chunks = []

start = 0

while start < len(full_text):

    end = start + chunk_size

    chunk = full_text[start:end]

    chunks.append(chunk)

    start += chunk_size - overlap


print("PDF processed successfully!")
print("Total chunks:", len(chunks))


# ==========================================
# Store chunks in ChromaDB
# ==========================================

count = add_chunks(
    chunks,
    COURSE_ID
)

print("Chunks stored in ChromaDB:", count)
print("Course ID:", COURSE_ID)