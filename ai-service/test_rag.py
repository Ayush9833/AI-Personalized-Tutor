from rag import search_chunks


# question = "What is the main topic discussed in this document?"
question = "Determine the analytic function whose real part is u = x^3 - 3xy^2 + 3x^2 - 3y^2 + 1."

results = search_chunks(question, 3)


print("\nQuestion:")
print(question)

print("\nRelevant chunks:\n")

for i, result in enumerate(results, 1):
    print(f"--- Result {i} ---")
    print(result)
    print()