from unittest.mock import MagicMock, patch
from app.services.resume_parser import extract_text_from_pdf
from app.schemas.profile import ParsedResumeSchema

def test_extract_text_mock():
    """
    Test extract_text_from_pdf by mocking pdfplumber to return predefined text content.
    """
    with patch("pdfplumber.open") as mock_open:
        mock_pdf = MagicMock()
        mock_page = MagicMock()
        mock_page.extract_text.return_value = "Jane Smith\nBackend Developer\nSkills: Python, MongoDB, FastAPI"
        mock_pdf.pages = [mock_page]
        mock_open.return_value.__enter__.return_value = mock_pdf
        
        text = extract_text_from_pdf("mock_resume.pdf")
        assert "Jane Smith" in text
        assert "FastAPI" in text
        print("PDF Text extraction mock test passed.")

def test_parsed_resume_schema():
    """
    Test ParsedResumeSchema validation and check that missing fields are populated with default values.
    """
    partial_data = {
        "full_name": "Jane Smith",
        "title": "Backend Developer",
        "skills": ["Python", "MongoDB", "FastAPI"],
        "social_links": {
            "github": "https://github.com/janesmith"
        }
    }
    validated = ParsedResumeSchema(**partial_data)
    assert validated.full_name == "Jane Smith"
    assert validated.bio == ""  # Should be populated with default empty string
    assert validated.experience == []  # Should be populated with default empty list
    assert validated.social_links.github == "https://github.com/janesmith"
    assert validated.social_links.linkedin == ""  # Default empty string
    print("Schema validation default-fallback test passed.")

if __name__ == "__main__":
    test_extract_text_mock()
    test_parsed_resume_schema()
    print("All parser pipeline unit tests passed successfully!")
