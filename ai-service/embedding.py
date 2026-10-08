from sentence_transformers import SentenceTransformer

print("Loading embedding model...")

model = SentenceTransformer("all-MiniLM-L6-v2")

print("Embedding model loaded successfully!")

text = "This is a test sentence for our AI tutor."

embedding = model.encode(text)

print("Embedding created!")
print("Number of dimensions:", len(embedding))
print("First 10 values:", embedding[:10])