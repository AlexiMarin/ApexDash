"""
Explorar datos de posición lateral y bordes de pista
"""
import duckdb

con = duckdb.connect('samples/Autodromo Nazionale Monza_P_2026-03-31T04_07_26Z.duckdb', read_only=True)

# Buscar datos relacionados con posición lateral/bordes
tables_to_check = ['Track Edge', 'Path Lateral']

for table in tables_to_check:
    try:
        print(f"\n{'='*50}")
        print(f"TABLA: {table}")
        print('='*50)
        
        cols = con.execute(f'DESCRIBE "{table}"').fetchall()
        print("Columnas:", [c[0] for c in cols])
        
        df = con.execute(f'SELECT * FROM "{table}"').fetchdf()
        print(f"Total filas: {len(df)}")
        print(f"\nPrimeras 10 filas:")
        print(df.head(10))
        
        # Stats
        if 'value' in df.columns:
            print(f"\nEstadísticas:")
            print(f"  Min: {df['value'].min():.3f}")
            print(f"  Max: {df['value'].max():.3f}")
            print(f"  Mean: {df['value'].mean():.3f}")
            print(f"  Std: {df['value'].std():.3f}")
    except Exception as e:
        print(f"Error: {e}")

# Ver si hay algo más útil
print(f"\n{'='*50}")
print("Tablas relacionadas con posición/pista:")
print('='*50)
tables = [t[0] for t in con.execute('SHOW TABLES').fetchall()]
keywords = ['track', 'path', 'edge', 'width', 'lateral', 'line', 'racing', 'position']
for t in tables:
    if any(k in t.lower() for k in keywords):
        count = con.execute(f'SELECT COUNT(*) FROM "{t}"').fetchone()[0]
        print(f"  {t} ({count} filas)")

con.close()
