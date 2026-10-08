import fitz
import pytesseract
from PIL import Image

PDF_PATH = r"..\backend\uploads\1791383802242-566525900.pdf"

pytesseract.pytesseract.tesseract_cmd = (
    r"C:\Program Files\Tesseract-OCR\tesseract.exe\tesseract.exe"
)

print("Opening PDF...")

doc = fitz.open(PDF_PATH)

# Test page 17 because your PDF analysis showed
# that pages 17-19 contain substantial content.
page = doc[17]

# Render at higher resolution
pix = page.get_pixmap(matrix=fitz.Matrix(3, 3))

image_path = "test_page.png"
pix.save(image_path)

print("Page converted to high-resolution image.")
print("Running Tesseract OCR...")

image = Image.open(image_path)

text = pytesseract.image_to_string(
    image,
    lang="eng",
    config="--psm 6"
)

print("\n========== OCR RESULT ==========\n")
print(text)
print("\n================================")

doc.close()