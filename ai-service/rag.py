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

def search_chunks(
    query,
    course_id,
    concept=None,
    number_of_results=3
):

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
