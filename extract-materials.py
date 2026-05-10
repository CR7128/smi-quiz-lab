from pathlib import Path
import json
import os
from pypdf import PdfReader
from docx import Document

BASE = Path(os.environ.get("COURSE_MATERIALS_DIR", "course-materials"))
FILES = [
    "Advertising and Distribution.pdf",
    "Competition.pdf",
    "Intro_Strategic_Thinking.pdf",
    "Practice questions.pdf",
    "Pricing.pdf",
    "Product Strategy.pdf",
    "Salesforce and Bargaining.pdf",
    "Segmentation and Positioning.pdf",
    "Report_Cournot Competition_BU.450.750.J1_group 3.pdf",
    "Report_Demarketing_BU.450.750.J1_group 7.pdf",
    "Report_Durable Goods_BU.450.750.J1_group 5.pdf",
    "Report_Exclusive Territories_BU.450.750.J1_group 8.pdf",
    "Report_Information Cascades_BU.450.750.J1_group 1.pdf",
    "Report_Network Effects_BU.450.750.J1_group 4.pdf",
    "Report_Stackelberg Competition_BU.450.750.J1_group 2.pdf",
    "Report_Vertical Differentiation_BU.450.750.J1_group 6.pdf",
    "Eco7 Case Opinion Question.pdf",
    "Eco7- Launching a New Motor Oil.pdf",
]
DOCX_FILES = [
    "United_Breaks_Guitars_Case_Opinion1.docx",
]
OUT = Path(__file__).resolve().parents[1] / "data" / "extracted-materials.json"


def main():
    materials = []
    for name in FILES:
        path = BASE / name
        reader = PdfReader(str(path))
        pages = []
        for index, page in enumerate(reader.pages, start=1):
            pages.append(
                {
                    "page": index,
                    "text": (page.extract_text() or "").replace("\x00", "").strip(),
                }
            )
        materials.append({"source": name, "pages": pages})

    for name in DOCX_FILES:
        path = BASE / name
        doc = Document(str(path))
        paragraphs = [p.text.strip() for p in doc.paragraphs if p.text.strip()]
        materials.append({"source": name, "pages": [{"page": 1, "text": "\n".join(paragraphs)}]})

    OUT.write_text(json.dumps(materials, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
