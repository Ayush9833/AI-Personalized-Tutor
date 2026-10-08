from paddleocr import PaddleOCR
import fitz
import os

PDF_PATH = r"..\backend\uploads\1791383802242-566525900.pdf"

print("Loading OCR model...")

ocr = PaddleOCR(
    lang="en"
)

print("OCR model loaded.")

doc = fitz.open(PDF_PATH)

# Test only the first page
page = doc[0]

# Render PDF page as image
pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))

image_path = "test_page.png"
pix.save(image_path)

print("Page converted to image.")
print("Running OCR...")

result = ocr.predict(image_path)

print("\n========== OCR RESULT ==========\n")

for res in result:
    print(res)

print("\n================================")

doc.close()