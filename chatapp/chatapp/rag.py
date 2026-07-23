from chatapp.ollama_client import get_embedding
import chromadb

client = chromadb.PersistentClient(path="./chroma_data")
collection = client.get_or_create_collection("documents")


def chunk_text(text, chunk_size=500, overlap=50):
    chunks = []
    step = chunk_size - overlap
    start = 0
    while start < len(text):
        chunk = text[start:start + chunk_size]
        chunks.append(chunk)
        start = start + step
    return chunks


def extract_text(filepath):
    if filepath.endswith('.pdf'):
        from pypdf import PdfReader
        reader = PdfReader(filepath)
        text = ""
        for page in reader.pages:
            text += page.extract_text()
        return text
    else:
        with open(filepath, 'r', encoding='utf-8') as f:
            return f.read()


def add_document(filepath, filename):
    text = extract_text(filepath)
    chunks = chunk_text(text)

    for i, chunk in enumerate(chunks):
        embedding = get_embedding(chunk)
        collection.add(
            ids=[f"{filename}_{i}"],
            embeddings=[embedding],
            documents=[chunk],
            metadatas=[{"filename": filename}]
        )

        
def delete_document(filename):
    collection.delete(where={"filename": filename})


def retrieve(question, n_results=3):
    query_embedding = get_embedding(question)
    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=n_results
    )
    return results


RELEVANCE_THRESHOLD = 450  # based on observed data: ~270-420 for relevant matches, ~490+ for unrelated


def retrieve_with_fallback(question, n_results=3):
    if collection.count() == 0:
        return None, []

    results = retrieve(question, n_results)

    best_distance = results['distances'][0][0]
    if best_distance > RELEVANCE_THRESHOLD:
        return None, []

    chunks = results['documents'][0]
    sources = [meta['filename'] for meta in results['metadatas'][0]]
    return chunks, sources