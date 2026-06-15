"""Template authoring — Excel-driven schema inference + save.

The frontend parses the .xlsx with SheetJS and posts a 2D cell array here.
We infer fields_schema (LLM-assisted, with a deterministic fallback) and
save as a PaperTemplate ObjectInstance.
"""
