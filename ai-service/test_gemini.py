import os
from dotenv import load_dotenv
from google import genai

# Load .env
load_dotenv()

api_key = os.getenv("GEMINI_API_KEY")

if not api_key:
    raise Exception("GEMINI_API_KEY not found in .env")

# Create Gemini client
client = genai.Client(api_key=api_key)

# Test Gemini
interaction = client.interactions.create(
    model="gemini-3.5-flash-lite",
    input="Explain complex numbers in simple words for a B.Tech student."
)

print("\nGemini Response:\n")
print(interaction.output_text)