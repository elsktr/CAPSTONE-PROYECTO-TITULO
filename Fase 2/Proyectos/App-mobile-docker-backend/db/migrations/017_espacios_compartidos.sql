-- Un espacio de bodega puede guardar varios productos: por ejemplo, distintos modelos de
-- poleras de la misma banda en una repisa. El código deja de ser único por producto.

ALTER TABLE inventario.productos DROP CONSTRAINT IF EXISTS productos_codigo_ubicacion_key;

-- Al escanear un espacio se buscan los productos guardados en él.
CREATE INDEX IF NOT EXISTS productos_codigo_ubicacion_idx ON inventario.productos (codigo_ubicacion);
