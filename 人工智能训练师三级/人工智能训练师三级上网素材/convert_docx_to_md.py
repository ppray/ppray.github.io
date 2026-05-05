#!/usr/bin/env python3
"""
DOCX to Markdown Converter v2
Uses macOS textutil to convert DOCX to HTML, then BeautifulSoup to parse to Markdown.
"""

import os
import re
import subprocess
import shutil
from pathlib import Path
from bs4 import BeautifulSoup


class DocxToMarkdownConverter:
    def __init__(self, base_dir):
        self.base_dir = Path(base_dir)

    def html_to_markdown(self, soup, docx_name):
        """Convert BeautifulSoup HTML to Markdown"""
        md_lines = []
        in_list = False

        # Process body content
        body = soup.find('body')
        if not body:
            return ""

        # Get all direct children of body
        for elem in body.children:
            if not hasattr(elem, 'name'):
                continue

            if elem.name == 'h1':
                text = self._get_text(elem)
                if text:
                    md_lines.append(f"# {text}\n")
                    in_list = False
            elif elem.name == 'h2':
                text = self._get_text(elem)
                if text:
                    md_lines.append(f"## {text}\n")
                    in_list = False
            elif elem.name == 'h3':
                text = self._get_text(elem)
                if text:
                    md_lines.append(f"### {text}\n")
                    in_list = False
            elif elem.name == 'p':
                text = self._process_paragraph(elem, docx_name)
                if text.strip():
                    md_lines.append(text)
                    in_list = False
            elif elem.name == 'ul':
                list_items = self._process_list(elem, '-', convert_blanks=False)
                md_lines.extend(list_items)
                in_list = True
            elif elem.name == 'ol':
                list_items = self._process_list(elem, '1.', convert_blanks=False)
                md_lines.extend(list_items)
                in_list = True
            elif elem.name == 'table':
                table_md = self._table_to_markdown(elem, convert_blanks=False)
                if table_md:
                    md_lines.append(table_md)
                    in_list = False

        result = '\n'.join(md_lines)

        # Clean up multiple blank lines
        result = re.sub(r'\n{3,}', '\n\n', result)

        return result.strip() + '\n'

    def _get_text(self, elem):
        """Get clean text from element"""
        return elem.get_text(strip=True)

    def _process_paragraph(self, elem, docx_name):
        """Process paragraph element and return markdown"""
        # Check if paragraph ends with lots of spaces (indicates blank/underline in DOCX)
        text = elem.get_text()

        # Check for Apple-converted-space which represents underlines/blank spaces
        apple_spaces = elem.find_all('span', class_='Apple-converted-space')
        has_blank = False

        for span in apple_spaces:
            # Count the spaces
            space_count = len(span.get_text())
            if space_count >= 5:  # Significant blank space
                has_blank = True
                break

        # Check for trailing spaces after certain keywords
        if docx_name.startswith(('4.1.', '4.2.')):
            # For chapter 4, check if this is a fill-in-the-blank line
            text_stripped = text.strip()

            # Pattern: ends with "：" followed by only spaces
            if '：' in text_stripped:
                parts = text_stripped.split('：', 1)
                if len(parts) == 2 and not parts[1].strip():
                    # This is a fill-in-the-blank, add underline
                    text = parts[0] + '：________________________'

            # Pattern: "包括" followed by only spaces, then "。"
            if has_blank and '包括' in text_stripped and text_stripped.endswith('。'):
                text = re.sub(r'Apple-converted-space">[ ]+', 'Apple-converted-space">________________________', str(elem))
                text = BeautifulSoup(text, 'html.parser').get_text()
                # Clean up the extra characters
                text = re.sub(r'\s+。', '________________________。', text)

        # Process inline formatting
        text = self._process_inline_formatting(elem, convert_blanks=False)

        return text.strip() + '\n'

    def _process_inline_formatting(self, elem, convert_blanks=False):
        """Process bold, italic and other inline formatting"""
        html = str(elem)

        # Replace <b> and <strong> with **
        html = re.sub(r'<[bB]>(.*?)</[bB]>', r'**\1**', html)
        html = re.sub(r'<strong>(.*?)</strong>', r'**\1**', html)

        # Replace <i> and <em> with *
        html = re.sub(r'<[iI]>(.*?)</[iI]>', r'*\1*', html)
        html = re.sub(r'<em>(.*?)</em>', r'*\1*', html)

        # Handle Apple-converted-space (represents underlines/blanks)
        if convert_blanks:
            # Convert to answer placeholder
            html = re.sub(r'<span class="s1">\s*<span class="Apple-converted-space">\s+ +\s*</span>\s*</span>',
                          '**[待填写]**', html)
            html = re.sub(r'<span class="Apple-converted-space">\s+ +\s*</span>',
                          '**[待填写]**', html)
        else:
            # Convert to underlines
            html = re.sub(r'<span class="s1">\s*<span class="Apple-converted-space">\s+ +\s*</span>\s*</span>',
                          '________________________', html)
            html = re.sub(r'<span class="Apple-converted-space">\s+ +\s*</span>',
                          '________________________', html)

        # Remove all remaining tags but keep text
        soup = BeautifulSoup(html, 'html.parser')
        return soup.get_text()

    def _process_list(self, elem, marker, convert_blanks=False):
        """Process list element"""
        items = []
        for li in elem.find_all('li', recursive=False):
            text = self._process_inline_formatting(li, convert_blanks)
            items.append(f"{marker} {text.strip()}")
        return items

    def _table_to_markdown(self, table, convert_blanks=False):
        """Convert HTML table to Markdown table"""
        rows = table.find_all('tr')
        if not rows:
            return ""

        md_rows = []

        for i, row in enumerate(rows):
            cells = row.find_all(['td', 'th'])
            row_data = []
            for cell in cells:
                text = self._process_inline_formatting(cell, convert_blanks)
                row_data.append(text.strip())

            if not row_data:
                continue

            md_row = "| " + " | ".join(row_data) + " |"
            md_rows.append(md_row)

            if i == 0:
                separator = "| " + " | ".join(["---"] * len(row_data)) + " |"
                md_rows.append(separator)

        return '\n'.join(md_rows) + '\n\n'

    def create_answer_file(self, soup, md_path, docx_name):
        """Create answer file for fill-in-the-blank questions"""
        # Re-convert with blanks converted to **[待填写]**
        md_lines = []
        in_list = False

        body = soup.find('body')
        if not body:
            return

        for elem in body.children:
            if not hasattr(elem, 'name'):
                continue

            if elem.name == 'h1':
                text = self._get_text(elem)
                if text:
                    md_lines.append(f"# {text}\n")
                    in_list = False
            elif elem.name == 'h2':
                text = self._get_text(elem)
                if text:
                    md_lines.append(f"## {text}\n")
                    in_list = False
            elif elem.name == 'h3':
                text = self._get_text(elem)
                if text:
                    md_lines.append(f"### {text}\n")
                    in_list = False
            elif elem.name == 'p':
                text = self._process_inline_formatting(elem, convert_blanks=True)
                if text.strip():
                    md_lines.append(text.strip() + '\n')
                    in_list = False
            elif elem.name == 'ul':
                list_items = self._process_list(elem, '-', convert_blanks=True)
                md_lines.extend(list_items)
                in_list = True
            elif elem.name == 'ol':
                list_items = self._process_list(elem, '1.', convert_blanks=True)
                md_lines.extend(list_items)
                in_list = True
            elif elem.name == 'table':
                table_md = self._table_to_markdown(elem, convert_blanks=True)
                if table_md:
                    md_lines.append(table_md)
                    in_list = False

        result = '\n'.join(md_lines)
        result = re.sub(r'\n{3,}', '\n\n', result)
        result = result.strip() + '\n'

        answer_path = md_path.parent / (md_path.stem + '_答案' + md_path.suffix)

        with open(answer_path, 'w', encoding='utf-8') as f:
            f.write(result)

        print(f"  → Created: {answer_path.name}")

    def convert_file(self, docx_path):
        """Convert a single DOCX file to Markdown"""
        docx_path = Path(docx_path)
        output_dir = docx_path.parent
        base_name = docx_path.stem

        # Output paths
        md_path = output_dir / f"{base_name}.md"

        # Create temp directory for HTML conversion
        temp_dir = self.base_dir / ".temp_html"
        temp_dir.mkdir(exist_ok=True)
        html_temp_path = temp_dir / f"{base_name}.html"

        try:
            # Step 1: Convert DOCX to HTML using textutil
            subprocess.run([
                'textutil',
                '-convert', 'html',
                str(docx_path),
                '-output', str(html_temp_path)
            ], check=True, capture_output=True)

            # Step 2: Read and parse HTML
            with open(html_temp_path, 'r', encoding='utf-8') as f:
                html_content = f.read()

            soup = BeautifulSoup(html_content, 'html.parser')

            # Step 3: Convert to Markdown
            markdown_content = self.html_to_markdown(soup, base_name)

            # Step 4: Write markdown file
            with open(md_path, 'w', encoding='utf-8') as f:
                f.write(markdown_content)

            # Step 5: Create answer file for Chapter 4 (4.1.x and 4.2.x)
            if base_name.startswith(('4.1.', '4.2.')):
                self.create_answer_file(soup, md_path, base_name)

            print(f"✓ Converted: {docx_path.parent.name}/{docx_path.name}")

            return True

        except Exception as e:
            print(f"✗ Error converting {docx_path.name}: {e}")
            import traceback
            traceback.print_exc()
            return False

    def convert_all(self):
        """Convert all DOCX files in the base directory"""
        # Find all DOCX files
        docx_files = list(self.base_dir.rglob("*.docx"))

        if not docx_files:
            print("No DOCX files found!")
            return

        print(f"Found {len(docx_files)} DOCX files to convert...\n")

        success_count = 0

        for docx_file in sorted(docx_files):
            if self.convert_file(docx_file):
                success_count += 1

        # Clean up temp directory
        temp_dir = self.base_dir / ".temp_html"
        if temp_dir.exists():
            shutil.rmtree(temp_dir)

        print(f"\nConversion complete: {success_count}/{len(docx_files)} files converted successfully")


def main():
    # Get the directory where this script is located
    script_dir = Path(__file__).parent

    converter = DocxToMarkdownConverter(script_dir)
    converter.convert_all()


if __name__ == "__main__":
    main()
