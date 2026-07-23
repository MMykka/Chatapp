from chatapp.rag import extract_text, add_document, collection

txt_result = extract_text("sample.txt")
print(txt_result[:200])

pdf_result = extract_text("sample.pdf")
print(pdf_result[:200])

print("\n--- Testing add_document ---")
add_document("sample.txt", "sample.txt")
print("Chunks stored:", collection.count())



from chatapp.rag import retrieve_with_fallback

print("\n--- Testing fallback logic ---")
chunks, sources = retrieve_with_fallback("How many vacation days do employees get?")
print("Relevant case:", chunks is not None, sources)

chunks2, sources2 = retrieve_with_fallback("What's the capital of France?")
print("Unrelated case:", chunks2 is not None, sources2)