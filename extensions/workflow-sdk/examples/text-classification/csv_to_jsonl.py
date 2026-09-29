"""Convert reviewed UTF-8 CSV labels to the evaluator's JSONL format."""
import argparse
import csv
import json
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('source', type=Path)
parser.add_argument('destination', type=Path)
args = parser.parse_args()
columns = ['id', 'texto', 'categoria_esperada']
if args.source.stat().st_size > 1048576:
    raise ValueError('CSV exceeds 1 MiB')
with args.source.open(encoding='utf-8-sig', newline='') as source:
    reader = csv.DictReader(source, strict=True)
    if reader.fieldnames != columns:
        raise ValueError('CSV header must be id,texto,categoria_esperada')
    rows = list(reader)
if not rows or len(rows) > 500:
    raise ValueError('Expected 1..500 records')
for row in rows:
    if set(row) != set(columns) or any(value is None for value in row.values()):
        raise ValueError('Malformed CSV row')
    if row['categoria_esperada'] not in ('urgente', 'normal', 'revisión'):
        raise ValueError('Unknown label')
with args.destination.open('x', encoding='utf-8', newline='\n') as destination:
    for row in rows:
        destination.write(json.dumps(row, ensure_ascii=False) + '\n')
