from sentence_transformers import SentenceTransformer
import chromadb
import uuid


# ============================================================
# EMBEDDING MODEL
# ============================================================

model = SentenceTransformer("all-MiniLM-L6-v2")

print("Embedding model loaded!")


# ============================================================
# CHROMADB
# ============================================================

client = chromadb.PersistentClient(
    path="./chroma_db"
)


collection = client.get_or_create_collection(
    name="course_materials"
)

print("ChromaDB collection ready!")


# ============================================================
# ADD CHUNKS
# ============================================================

def add_chunks(chunks, course_id, concept):

    """
    chunks can be:

    1. Plain strings
       "This is some course content."

    OR

    2. Dictionaries with page information
       {
           "text": "This is some course content.",
           "page": 18
       }
    """

    documents = []
    metadatas = []
    ids = []

    for chunk in chunks:

        # ----------------------------------------------------
        # If chunk contains page information
        # ----------------------------------------------------

        if isinstance(chunk, dict):

            text = chunk.get("text", "").strip()

            page = chunk.get("page", 0)

        # ----------------------------------------------------
        # Backward compatibility for plain text chunks
        # ----------------------------------------------------

        else:

            text = str(chunk).strip()

            page = 0


        # Skip empty chunks

        if not text:
            continue


        documents.append(text)


        metadatas.append(
            {
                "course_id": str(course_id),

                "concept": str(concept),

                "page": int(page)
            }
        )


        ids.append(
            f"{course_id}_{concept}_{uuid.uuid4()}"
        )


    # --------------------------------------------------------
    # Nothing to add
    # --------------------------------------------------------

    if not documents:

        return 0


    # --------------------------------------------------------
    # Create embeddings
    # --------------------------------------------------------

    embeddings = model.encode(
        documents
    ).tolist()


    # --------------------------------------------------------
    # Store in ChromaDB
    # --------------------------------------------------------

    collection.add(

        ids=ids,

        documents=documents,

        embeddings=embeddings,

        metadatas=metadatas

    )


    return len(documents)


# ============================================================
# SEARCH CHUNKS
# ============================================================


# ============================================================
# SEARCH CHUNKS - FIXED
# ============================================================

def search_chunks(
    query,
    course_id,
    concept=None,
    number_of_results=3
):
    """
    Search course material.

    If the requested concept has matching chunks, search within
    that concept. If no matching chunks exist for the concept,
    fall back to searching all material for the same course.
    """

    query = str(query or "").strip()
    course_id = str(course_id or "").strip()

    if not query or not course_id:
        return []

    number_of_results = max(1, int(number_of_results))

    query_embedding = model.encode([query]).tolist()

    # First try the requested concept.
    if concept and str(concept).strip():
        concept = str(concept).strip()

        concept_filter = {
            "$and": [
                {"course_id": course_id},
                {"concept": concept}
            ]
        }

        concept_results = collection.query(
            query_embeddings=query_embedding,
            n_results=number_of_results,
            where=concept_filter
        )

        documents = (concept_results.get("documents") or [[]])[0]

        if documents:
            metadatas = (concept_results.get("metadatas") or [[]])[0]

            formatted_results = []

            for document, metadata in zip(documents, metadatas):
                metadata = metadata or {}
                page = metadata.get("page", 0)

                source = (
                    f"\n\n[Source: Page {page}]\n"
                    if page
                    else "\n\n[Source: Page unknown]\n"
                )

                formatted_results.append(source + document)

            return formatted_results

    # No matching concept chunks: search all material for this course.
    course_filter = {"course_id": course_id}

    results = collection.query(
        query_embeddings=query_embedding,
        n_results=number_of_results,
        where=course_filter
    )

    documents = (results.get("documents") or [[]])[0]
    metadatas = (results.get("metadatas") or [[]])[0]

    formatted_results = []

    for document, metadata in zip(documents, metadatas):
        metadata = metadata or {}
        page = metadata.get("page", 0)

        source = (
            f"\n\n[Source: Page {page}]\n"
            if page
            else "\n\n[Source: Page unknown]\n"
        )

        formatted_results.append(source + document)

    return formatted_results

    # --------------------------------------------------------
    # Create query embedding
    # --------------------------------------------------------

    query_embedding = model.encode(
        [query]
    ).tolist()


    # --------------------------------------------------------
    # Course filter
    # --------------------------------------------------------

    where_filter = {

        "course_id": str(course_id)

    }


    # --------------------------------------------------------
    # Course + concept filter
    # --------------------------------------------------------

    if concept:

        where_filter = {

            "$and": [

                {
                    "course_id": str(course_id)
                },

                {
                    "concept": str(concept)
                }

            ]

        }


    # --------------------------------------------------------
    # Search ChromaDB
    # --------------------------------------------------------

    results = collection.query(

        query_embeddings=query_embedding,

        n_results=number_of_results,

        where=where_filter

    )


    documents = results.get(
        "documents",
        [[]]
    )[0]

    metadatas = results.get(
        "metadatas",
        [[]]
    )[0]


    # --------------------------------------------------------
    # Combine document + source information
    # --------------------------------------------------------

    formatted_results = []


    for document, metadata in zip(
        documents,
        metadatas
    ):

        page = metadata.get(
            "page",
            0
        )


        if page and page > 0:

            source = (
                f"\n\n[Source: Page {page}]\n"
            )

        else:

            source = "\n\n[Source: Page unknown]\n"


        formatted_results.append(
            source + document
        )


    return formatted_results


# ============================================================
# DELETE CONCEPT
# ============================================================

def delete_concept(
    course_id,
    concept
):

    results = collection.get(

        where={
            "$and": [

                {
                    "course_id": str(course_id)
                },

                {
                    "concept": str(concept)
                }

            ]
        }

    )


    ids = results.get(
        "ids",
        []
    )


    if ids:

        collection.delete(
            ids=ids
        )


    return len(ids)
