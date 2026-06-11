import pdfplumber

def extract_text_from_pdf(pdf_path: str) -> str:
    """
    Extracts raw text content from all pages of a PDF resume.
    """
    text = ""
    try:
        with pdfplumber.open(pdf_path) as pdf:
            for page in pdf.pages:
                extracted = page.extract_text()
                if extracted:
                    text += extracted + "\n"
    except Exception as e:
        print(f"Error extracting text from PDF {pdf_path}: {e}")
        raise ValueError(f"Failed to read PDF file: {str(e)}")
    return text.strip()
