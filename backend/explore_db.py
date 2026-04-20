"""
Script para explorar los archivos DuckDB de telemetría de Le Mans Ultimate
"""
import duckdb
import os
from pathlib import Path

def explore_database(db_path: str):
    """Explora un archivo DuckDB y muestra su estructura"""
    con = duckdb.connect(db_path, read_only=True)
    
    print("=" * 60)
    print(f"ARCHIVO: {os.path.basename(db_path)}")
    print("=" * 60)
    
    # Obtener tablas
    tables = con.execute("SHOW TABLES").fetchall()
    
    result = {}
    for table in tables:
        table_name = table[0]
        print(f"\n{'='*60}")
        print(f"TABLA: {table_name}")
        print("=" * 60)
        
        # Columnas (usar comillas para nombres con espacios)
        cols = con.execute(f'DESCRIBE "{table_name}"').fetchall()
        print("\nColumnas:")
        columns = []
        for col in cols:
            print(f"  - {col[0]}: {col[1]}")
            columns.append({"name": col[0], "type": col[1]})
        
        # Contar filas
        count = con.execute(f'SELECT COUNT(*) FROM "{table_name}"').fetchone()[0]
        print(f"\nTotal filas: {count:,}")
        
        # Ejemplo
        if count > 0:
            print("\nEjemplo (3 filas):")
            sample = con.execute(f'SELECT * FROM "{table_name}" LIMIT 3').fetchdf()
            print(sample.to_string())
        
        result[table_name] = {"columns": columns, "row_count": count}
    
    con.close()
    return result

if __name__ == "__main__":
    # Buscar archivos .duckdb en el directorio padre
    parent_dir = Path(__file__).parent.parent
    db_files = list(parent_dir.glob("*.duckdb"))
    
    if not db_files:
        print("No se encontraron archivos .duckdb")
    else:
        print(f"Encontrados {len(db_files)} archivos:\n")
        for f in db_files:
            print(f"  - {f.name}")
        
        # Explorar el más reciente
        latest = sorted(db_files)[-1]
        print(f"\n\nExplorando: {latest.name}\n")
        explore_database(str(latest))
