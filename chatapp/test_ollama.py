# test_ollama.py — throwaway, not part of the app
from chatapp.ollama_client import check_connection, chat_completion, get_embedding

print("--- Testing check_connection() ---")
connected, model = check_connection()
print(f"Connected: {connected}, Model: {model}")

print("\n--- Testing chat_completion() ---")
reply = chat_completion([{"role": "user", "content": "Say hello in one short sentence."}])
print(f"Reply: {reply}")

print("\n--- Testing get_embedding() ---")
vector = get_embedding("This is a test sentence.")
if vector:
    print(f"Embedding length: {len(vector)} numbers")
    print(f"First 5 values: {vector[:5]}")
else:
    print("Embedding failed.")