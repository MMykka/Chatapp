

from chatapp.ollama_client import chat_completion_stream

print("--- Testing chat_completion_stream() ---")
for piece in chat_completion_stream([{"role": "user", "content": "Count from 1 to 5."}]):
    print(piece, end="", flush=True)
print()