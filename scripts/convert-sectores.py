#!/usr/bin/env python3
"""Convert the CESFAM sector spreadsheet into the application's JSON lookup base."""
import argparse
import json
import re
import unicodedata
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
SECTORS = (('A', 'amarillo'), ('B', 'azul'), ('C', 'verde'))


def normalize(value):
    """Canonical key used by the application for accent/case-insensitive searches."""
    value = unicodedata.normalize('NFD', value.upper())
    value = ''.join(char for char in value if unicodedata.category(char) != 'Mn')
    return re.sub(r'\s+', ' ', value).strip()


def column(ref):
    return re.match(r'[A-Z]+', ref).group(0)


def read_rows(source):
    with zipfile.ZipFile(source) as workbook:
        shared = ET.fromstring(workbook.read('xl/sharedStrings.xml'))
        strings = [
            ''.join(node.text or '' for node in item.iter(NS + 't'))
            for item in shared.findall(NS + 'si')
        ]
        sheet = ET.fromstring(workbook.read('xl/worksheets/sheet1.xml'))

    rows = []
    for row in sheet.findall('.//' + NS + 'row'):
        values = {}
        for cell in row.findall(NS + 'c'):
            value = cell.find(NS + 'v')
            if value is None or not value.text:
                continue
            text = strings[int(value.text)] if cell.get('t') == 's' else value.text
            values[column(cell.get('r'))] = text.strip()
        rows.append(values)
    return rows


def convert(source):
    rows = read_rows(source)
    lookup = []
    for excel_column, sector in SECTORS:
        streets = []
        for row in rows[2:]:  # row 1 is title; row 2 names the sectors
            street = row.get(excel_column, '').strip()
            if street:
                streets.append({'name': street, 'normalizedName': normalize(street)})
        lookup.append({'id': sector, 'name': f'Sector {sector.title()}', 'streets': streets})
    return {'version': 1, 'source': Path(source).name, 'sectors': lookup}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('source', type=Path)
    parser.add_argument('destination', type=Path)
    args = parser.parse_args()
    args.destination.parent.mkdir(parents=True, exist_ok=True)
    args.destination.write_text(
        json.dumps(convert(args.source), ensure_ascii=False, indent=2) + '\n', encoding='utf-8'
    )


if __name__ == '__main__':
    main()
