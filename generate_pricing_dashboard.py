from collections import defaultdict
from xml.sax.saxutils import escape

output_file = "IT_Implementation_Pricing_Dashboard.xml"

practices = {
    "Cloud": ["AWS", "Azure", "GCP"],
    "Data": ["Databricks", "Snowflake", "Power BI"],
    "Application": ["Java", ".NET", "React"],
    "DevOps": ["Kubernetes", "Terraform", "Jenkins"],
    "Cybersecurity": ["SIEM", "IAM", "AppSec"],
}

grades = [
    ("G1", "Associate", 55),
    ("G2", "Engineer", 75),
    ("G3", "Senior Engineer", 95),
    ("G4", "Lead", 120),
    ("G5", "Architect", 145),
]

month_multipliers = {
    "Month 1": 1.15,
    "Month 2": 1.10,
    "Month 3": 1.00,
    "Month 4": 1.00,
    "Month 5": 0.95,
    "Month 6": 0.90,
}

hours_per_month = 160
rows = []

for practice, stacks in practices.items():
    for stack in stacks:
        for grade_code, role, base_rate in grades:
            for month, m_mult in month_multipliers.items():
                if grade_code in {"G4", "G5"}:
                    base_fte = 0.6
                elif grade_code == "G3":
                    base_fte = 1.0
                else:
                    base_fte = 1.4

                if month in {"Month 1", "Month 2"}:
                    fte = round(base_fte * 1.1, 2)
                elif month in {"Month 5", "Month 6"}:
                    fte = round(base_fte * 0.9, 2)
                else:
                    fte = round(base_fte, 2)

                rate = round(base_rate * m_mult, 2)
                cost = round(fte * hours_per_month * rate, 2)

                rows.append([
                    practice,
                    stack,
                    grade_code,
                    role,
                    month,
                    fte,
                    hours_per_month,
                    rate,
                    cost,
                ])

cost_by_grade = defaultdict(float)
cost_by_practice = defaultdict(float)
fte_by_practice = defaultdict(float)
for r in rows:
    cost_by_grade[r[2]] += r[8]
    cost_by_practice[r[0]] += r[8]
    fte_by_practice[r[0]] += r[5]

total_cost = sum(r[8] for r in rows)
total_fte = sum(r[5] for r in rows)
avg_rate = sum(r[7] for r in rows) / len(rows)


def str_cell(v, style="Data"):
    return f'<Cell ss:StyleID="{style}"><Data ss:Type="String">{escape(str(v))}</Data></Cell>'


def num_cell(v, style="Num"):
    return f'<Cell ss:StyleID="{style}"><Data ss:Type="Number">{v}</Data></Cell>'


def row_xml(cells):
    return "<Row>" + "".join(cells) + "</Row>"

xml = []
xml.append('<?xml version="1.0"?>')
xml.append('<?mso-application progid="Excel.Sheet"?>')
xml.append('<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"')
xml.append(' xmlns:o="urn:schemas-microsoft-com:office:office"')
xml.append(' xmlns:x="urn:schemas-microsoft-com:office:excel"')
xml.append(' xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"')
xml.append(' xmlns:html="http://www.w3.org/TR/REC-html40">')
xml.append('<Styles>')
xml.append('<Style ss:ID="Header"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#1F4E78" ss:Pattern="Solid"/></Style>')
xml.append('<Style ss:ID="Data"><Alignment ss:Vertical="Center"/></Style>')
xml.append('<Style ss:ID="Num"><NumberFormat ss:Format="0.00"/></Style>')
xml.append('<Style ss:ID="Money"><NumberFormat ss:Format="$#,##0.00"/></Style>')
xml.append('<Style ss:ID="Title"><Font ss:Bold="1" ss:Size="14" ss:Color="#1F4E78"/></Style>')
xml.append('</Styles>')

# Resource load sheet
xml.append('<Worksheet ss:Name="Resource_Loads">')
xml.append(f'<Table ss:ExpandedColumnCount="9" ss:ExpandedRowCount="{len(rows)+1}" x:FullColumns="1" x:FullRows="1">')
headers = ["Practice", "Tech_Stack", "Grade_Level", "Role", "Month", "FTE_Load", "Hours_per_Month", "Bill_Rate_USD_per_Hour", "Monthly_Cost_USD"]
xml.append(row_xml([f'<Cell ss:StyleID="Header"><Data ss:Type="String">{h}</Data></Cell>' for h in headers]))
for r in rows:
    xml.append(row_xml([
        str_cell(r[0]), str_cell(r[1]), str_cell(r[2]), str_cell(r[3]), str_cell(r[4]),
        num_cell(r[5]), num_cell(r[6]), num_cell(r[7], "Money"), num_cell(r[8], "Money")
    ]))
xml.append('</Table>')
xml.append(f'<AutoFilter x:Range="R1C1:R{len(rows)+1}C9" xmlns="urn:schemas-microsoft-com:office:excel"/>')
xml.append('</Worksheet>')

# Dashboard sheet
xml.append('<Worksheet ss:Name="Dashboard">')
xml.append('<Table ss:ExpandedColumnCount="8" ss:ExpandedRowCount="40" x:FullColumns="1" x:FullRows="1">')
xml.append('<Row><Cell ss:MergeAcross="4" ss:StyleID="Title"><Data ss:Type="String">IT Implementation Project Pricing Dashboard</Data></Cell></Row>')
xml.append('<Row/>')
xml.append(row_xml([str_cell('KPI', 'Header'), str_cell('Value', 'Header')]))
xml.append(row_xml([str_cell('Total Cost (USD)'), num_cell(round(total_cost,2), 'Money')]))
xml.append(row_xml([str_cell('Total FTE Load'), num_cell(round(total_fte,2), 'Num')]))
xml.append(row_xml([str_cell('Average Bill Rate (USD/Hr)'), num_cell(round(avg_rate,2), 'Money')]))
xml.append('<Row/>')
xml.append(row_xml([str_cell('Cost by Grade', 'Header'), str_cell('Cost (USD)', 'Header')]))
for grade, _, _ in grades:
    xml.append(row_xml([str_cell(grade), num_cell(round(cost_by_grade[grade],2), 'Money')]))
xml.append('<Row/>')
xml.append(row_xml([str_cell('Practice'), str_cell('Total FTE'), str_cell('Total Cost (USD)')]))
for practice in practices:
    xml.append(row_xml([str_cell(practice), num_cell(round(fte_by_practice[practice],2), 'Num'), num_cell(round(cost_by_practice[practice],2), 'Money')]))
xml.append('<Row/>')
xml.append(row_xml([str_cell('How to use slicers in Excel:', 'Header')]))
xml.append(row_xml([str_cell('1) Open Resource_Loads sheet and click any cell in the table.')]))
xml.append(row_xml([str_cell('2) Go to Data > Filter (already enabled).')]))
xml.append(row_xml([str_cell('3) In desktop Excel: Insert > Slicer, then choose Practice, Tech_Stack, Grade_Level, Month.')]))
xml.append(row_xml([str_cell('4) Connect slicers to this dashboard summary if using PivotTables.')]))
xml.append('</Table>')
xml.append('</Worksheet>')

xml.append('</Workbook>')

with open(output_file, 'w', encoding='utf-8') as f:
    f.write("\n".join(xml))

print(f"Created {output_file} with {len(rows)} resource rows")
