import chromadb
from sentence_transformers import SentenceTransformer


# Load embedding model
model = SentenceTransformer("all-MiniLM-L6-v2")

print("Embedding model loaded successfully!")


# Create ChromaDB client
client = chromadb.PersistentClient(path="./chroma_db")

print("ChromaDB connected successfully!")


# Create or get collection
collection = client.get_or_create_collection(
    name="course_materials"
)

print("Collection ready!")


# Example chunks
chunks = [
    "Complex numbers can be represented in the form a + ib.",
    "The modulus of a complex number z = a + ib is sqrt(a^2 + b^2).",
    "The principal argument of a complex number represents its angle."
]


# Create embeddings
embeddings = model.encode(chunks).tolist()

print("Embeddings created!")
print("Number of chunks:", len(chunks))
print("Embedding dimensions:", len(embeddings[0]))


# Store data in ChromaDB
collection.add(
    ids=["chunk_1", "chunk_2", "chunk_3"],
    documents=chunks,
    embeddings=embeddings
)

print("Chunks stored in ChromaDB successfully!")


# Test similarity search
query = "What is the modulus of a complex number?"

query_embedding = model.encode([query]).tolist()

results = collection.query(
    query_embeddings=query_embedding,
    n_results=2
)

print("\nSearch Results:")
print(results["documents"])