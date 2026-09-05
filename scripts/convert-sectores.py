#!/usr/bin/env python3
"""Convert the CESFAM sector spreadsheet into the application's JSON lookup base.

The spreadsheet keeps one column per sector and writes street names in upper
case. Streets that a sector shares with another one carry the house-number split
inside the name itself ("ANDRÉS BELLO, MENOR DE 800"), so the converter parses
that suffix into a structured range the application can evaluate.
"""
import argparse
import json
import re
import sys
import unicodedata
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
SECTOR_HEADER_ROW = 2
FIRST_DATA_ROW = SECTOR_HEADER_ROW + 1

# The spreadsheet is typed by hand, so the suffix appears with missing "DE" and
# missing spaces ("MAYORDE 800"). Both are accepted on purpose. The keyword and
# the pivot are ASCII, so the pattern runs on the raw name and keeps its accents.
RANGE_PATTERN = re.compile(
    r'^(?P<base>.+?)\s*[,;]\s*(?P<word>MENOR|MAYOR)\s*(?:DE)?\s*(?P<pivot>\d+)\s*$',
    re.IGNORECASE,
)
COMPARATORS = {'MENOR': 'lt', 'MAYOR': 'gte'}


def strip_accents(value):
    value = unicodedata.normalize('NFD', value)
    return ''.join(char for char in value if unicodedata.category(char) != 'Mn')


def normalize(value):
    """Canonical key used by the application for accent/case-insensitive searches."""
    return re.sub(r'\s+', ' ', strip_accents(str(value)).upper()).strip()


def slugify(value):
    return re.sub(r'[^a-z0-9]+', '-', strip_accents(str(value)).lower()).strip('-')


def parse_street(raw_name):
    """Split a spreadsheet entry into its base street and its house-number range."""
    entry = {'name': raw_name, 'normalizedName': normalize(raw_name)}
    match = RANGE_PATTERN.match(raw_name)
    if not match:
        entry['baseName'] = raw_name
        entry['normalizedBase'] = entry['normalizedName']
        return entry

    comparator = COMPARATORS[match.group('word').upper()]
    pivot = int(match.group('pivot'))
    entry['baseName'] = match.group('base').strip()
    entry['normalizedBase'] = normalize(entry['baseName'])
    entry['range'] = {
        'comparator': comparator,
        'pivot': pivot,
        'label': f'{"menor" if comparator == "lt" else "mayor"} de {pivot}',
    }
    return entry


def cell_text(cell, strings):
    """Read a cell as text, supporting shared strings and inline strings."""
    if cell.get('t') == 'inlineStr':
        inline = cell.find(NS + 'is')
        return ''.join(node.text or '' for node in inline.iter(NS + 't')) if inline is not None else ''

    value = cell.find(NS + 'v')
    if value is None or value.text is None:
        return ''
    if cell.get('t') != 's':
        return value.text
    index = int(value.text)
    if not 0 <= index < len(strings):
        raise ValueError(f'cell {cell.get("r")} points at missing shared string {index}')
    return strings[index]


def column_of(reference):
    match = re.match(r'([A-Z]+)(\d+)$', reference or '')
    if not match:
        raise ValueError(f'unsupported cell reference: {reference!r}')
    return match.group(1)


def read_rows(source):
    """Return {row number: {column letter: text}} for the first worksheet."""
    with zipfile.ZipFile(source) as workbook:
        names = set(workbook.namelist())
        strings = []
        if 'xl/sharedStrings.xml' in names:
            shared = ET.fromstring(workbook.read('xl/sharedStrings.xml'))
            strings = [
                ''.join(node.text or '' for node in item.iter(NS + 't'))
                for item in shared.findall(NS + 'si')
            ]
        sheet = ET.fromstring(workbook.read('xl/worksheets/sheet1.xml'))

    rows = {}
    # Excel omits empty rows entirely, so index by the row's own "r" attribute
    # instead of by position in the document.
    for position, row in enumerate(sheet.findall('.//' + NS + 'row'), start=1):
        number = int(row.get('r') or position)
        values = {}
        for cell in row.findall(NS + 'c'):
            text = cell_text(cell, strings).strip()
            if text:
                values[column_of(cell.get('r'))] = text
        rows[number] = values
    return rows


def read_sectors(rows):
    """Read the sector columns from the header row instead of hard-coding A/B/C."""
    header = rows.get(SECTOR_HEADER_ROW, {})
    sectors = []
    for letter, title in sorted(header.items()):
        identifier = slugify(re.sub(r'^SECTOR\s+', '', normalize(title)))
        if not identifier:
            continue
        sectors.append({'column': letter, 'id': identifier, 'name': title.title()})
    if not sectors:
        raise ValueError(f'row {SECTOR_HEADER_ROW} of the spreadsheet declares no sectors')
    return sectors


def convert(source):
    rows = read_rows(source)
    warnings = []
    lookup = []
    for sector in read_sectors(rows):
        streets = []
        seen = set()
        for number in sorted(row for row in rows if row >= FIRST_DATA_ROW):
            raw_name = rows[number].get(sector['column'], '').strip()
            if not raw_name:
                continue
            entry = parse_street(raw_name)
            if entry['normalizedName'] in seen:
                warnings.append(f'{sector["id"]}: duplicate entry "{raw_name}" (row {number}) ignored')
                continue
            seen.add(entry['normalizedName'])
            streets.append(entry)
        lookup.append({'id': sector['id'], 'name': sector['name'], 'streets': streets})

    warnings.extend(find_overlaps(lookup))
    return {'version': 2, 'source': Path(source).name, 'sectors': lookup}, warnings


def find_overlaps(sectors):
    """Report base streets listed in several sectors without a house-number split."""
    placements = {}
    for sector in sectors:
        for street in sector['streets']:
            placements.setdefault(street['normalizedBase'], []).append((sector['id'], street))

    warnings = []
    for base, entries in sorted(placements.items()):
        sector_ids = {sector_id for sector_id, _ in entries}
        if len(sector_ids) < 2:
            continue
        if all('range' in street for _, street in entries):
            continue
        warnings.append(
            f'ambiguous: "{base}" appears in {", ".join(sorted(sector_ids))} without a house-number range'
        )
    return warnings


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('destination', type=Path)
    parser.add_argument('--strict', action='store_true', help='fail when the spreadsheet reports warnings')
    args = parser.parse_args()

    database, warnings = convert(args.source)
    for warning in warnings:
        print(f'warning: {warning}', file=sys.stderr)
    if warnings and args.strict:
        raise SystemExit(1)

    args.destination.parent.mkdir(parents=True, exist_ok=True)
    args.destination.write_text(
        json.dumps(database, ensure_ascii=False, indent=2) + '\n', encoding='utf-8'
    )
    total = sum(len(sector['streets']) for sector in database['sectors'])
    print(f'{args.destination}: {len(database["sectors"])} sectores, {total} calles', file=sys.stderr)


if __name__ == '__main__':
    main()
