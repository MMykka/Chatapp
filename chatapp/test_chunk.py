from chatapp.rag import extract_text
text = extract_text("employee_handbook.pdf")
print(len(text))
print(text[:500])
print("sick" in text.lower())

from chatapp.rag import collection
print(collection.count())
print(collection.get(where={"filename": "employee_handbook.pdf"})['documents'][:1])