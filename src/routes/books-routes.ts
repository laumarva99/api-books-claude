import { Router } from "express";
import type { Response } from "express";
import { validate as validateUuid } from "uuid";
import type { Book, BookData, BooksStorage } from "../services/books-storage";
//import { BooksStorageInMemory } from "../services/books-storage-in-memory";
import { BooksStorageInNoSQL } from "../services/books-storage-in-nosql";

// Parámetros de la URL; `unknown` obliga a comprobar el valor antes de usarlo
type Query = Record<string, unknown>;

// Las rutas no tocan los datos directamente: siempre a través del contrato BooksStorage.
// Para cambiar de almacenamiento (p. ej. MongoDB), solo hay que cambiar esta línea.
//const storage: BooksStorage = new BooksStorageInMemory();

const storage: BooksStorage = new BooksStorageInNoSQL();

// Campos de texto: obligatorios al crear o sustituir un libro, opcionales al modificarlo (PATCH)
const TEXT_FIELDS = ["author", "country", "imageLink", "language", "link", "title"] as const;

// Todos los campos que se pueden editar (el id nunca)
const EDITABLE_FIELDS = [...TEXT_FIELDS, "pages", "year"] as const;

const router = Router();

/**
 * GET /api/books
 *
 * Texto (busca dentro del texto):  ?author=  ?country=  ?language=  ?title=  ?link=  ?imageLink=
 * Números (pages, year):           ?pages=  ?pages_gt=  ?pages_gte=  ?pages_lt=  ?pages_lte=
 *                                  ?year=1958  ?year_gt=  ?year_gte=  ?year_lt=  ?year_lte=
 * Límite de resultados:            ?limit=10
 *
 * Ejemplo: /api/books?country=chi&pages_gte=200&limit=5
 */
router.get("/", async (req, res) => {
  const query: Query = req.query;
  const books = await storage.findAll();

  const filteredBooks = books.filter((book) => matchesAllFilters(book, query));

  res.json(applyLimit(filteredBooks, query.limit));
});

/**
 * GET /api/books/:id
 *
 * Devuelve el libro con ese id.
 * 400 si el id no es un UUID válido, 404 si no existe.
 *
 * Ejemplo: /api/books/99d9de0b-95a4-4b4f-b684-ed478b4a15a7
 */
router.get("/:id", async (req, res) => {
  const id = parseId(req.params.id);

  if (id === undefined) {
    res.status(400).json({ error: "El id debe ser un UUID válido" });
    return;
  }

  const book = await storage.findById(id);

  if (!book) {
    sendNotFound(res, id);
    return;
  }

  res.json(book);
});

/**
 * POST /api/books
 *
 * Crea un libro. El id lo asigna el almacenamiento (un UUID nuevo); si el body trae un id, se ignora.
 * 400 con un error por cada campo no válido.
 *
 * Body: { author, country, imageLink, language, link, title, pages, year }
 */
router.post("/", async (req, res) => {
  const body: Query = req.body ?? {};
  const errors = validateBook(body);

  if (Object.keys(errors).length > 0) {
    res.status(400).json({ errors });
    return;
  }

  const newBook = await storage.create(toBookData(body));

  res.status(201).json(newBook);
});

/**
 * PUT /api/books/:id
 *
 * Sustituye por completo el libro con ese id (hay que enviar todos los campos).
 * El id de la URL manda: si el body trae un id, se ignora.
 * 400 si el id no es un UUID válido o algún campo no es válido, 404 si no existe.
 *
 * Body: { author, country, imageLink, language, link, title, pages, year }
 */
router.put("/:id", async (req, res) => {
  const id = parseId(req.params.id);

  if (id === undefined) {
    res.status(400).json({ error: "El id debe ser un UUID válido" });
    return;
  }

  // Se comprueba antes de validar el body: un id inexistente da 404 aunque el body sea inválido
  if (!(await storage.findById(id))) {
    sendNotFound(res, id);
    return;
  }

  const body: Query = req.body ?? {};
  const errors = validateBook(body);

  if (Object.keys(errors).length > 0) {
    res.status(400).json({ errors });
    return;
  }

  const updatedBook = await storage.replace(id, toBookData(body));

  // Por si se borró entre la comprobación y la escritura (posible con una base de datos)
  if (!updatedBook) {
    sendNotFound(res, id);
    return;
  }

  res.json(updatedBook);
});

/**
 * PATCH /api/books/:id
 *
 * Modifica solo los campos que se envían; el resto del libro no cambia.
 * Cada campo enviado se valida con las mismas reglas que en POST y PUT.
 * El id de la URL manda: si el body trae un id, se ignora. Los campos desconocidos también se ignoran.
 * 400 si el id no es un UUID válido, no se envía ningún campo editable o alguno no es válido.
 * 404 si no existe.
 *
 * Body (todos opcionales, al menos uno): { author, country, imageLink, language, link, title, pages, year }
 *
 * Ejemplo: PATCH /api/books/99d9de0b-95a4-4b4f-b684-ed478b4a15a7  { "pages": 210 }
 */
router.patch("/:id", async (req, res) => {
  const id = parseId(req.params.id);

  if (id === undefined) {
    res.status(400).json({ error: "El id debe ser un UUID válido" });
    return;
  }

  // Se comprueba antes de validar el body: un id inexistente da 404 aunque el body sea inválido
  if (!(await storage.findById(id))) {
    sendNotFound(res, id);
    return;
  }

  const body: Query = req.body ?? {};

  if (!EDITABLE_FIELDS.some((field) => body[field] !== undefined)) {
    res.status(400).json({
      error: `Hay que enviar al menos un campo: ${EDITABLE_FIELDS.join(", ")}`,
    });
    return;
  }

  const errors = validateBook(body, { partial: true });

  if (Object.keys(errors).length > 0) {
    res.status(400).json({ errors });
    return;
  }

  const patchedBook = await storage.update(id, toPartialBookData(body));

  if (!patchedBook) {
    sendNotFound(res, id);
    return;
  }

  res.json(patchedBook);
});

/**
 * DELETE /api/books/:id
 *
 * Borra el libro con ese id y lo devuelve en la respuesta (200).
 * 400 si el id no es un UUID válido, 404 si no existe.
 *
 * Ejemplo: DELETE /api/books/99d9de0b-95a4-4b4f-b684-ed478b4a15a7
 */
router.delete("/:id", async (req, res) => {
  const id = parseId(req.params.id);

  if (id === undefined) {
    res.status(400).json({ error: "El id debe ser un UUID válido" });
    return;
  }

  const deletedBook = await storage.remove(id);

  if (!deletedBook) {
    sendNotFound(res, id);
    return;
  }

  res.json(deletedBook);
});

// Respuesta 404 común a todas las rutas con :id
function sendNotFound(res: Response, id: string): void {
  res.status(404).json({ error: `No existe ningún libro con id ${id}` });
}

/**
 * Devuelve un error por cada campo no válido (vacío si todo está bien).
 *
 * @param body - Body de la petición, sin validar.
 * @param options.partial - Si es true (PATCH), los campos ausentes no se validan;
 *   si es false (POST y PUT), todos son obligatorios.
 * @returns Un objeto campo -> mensaje de error.
 */
function validateBook(body: Query, { partial = false } = {}): Record<string, string> {
  const errors: Record<string, string> = {};

  // En PATCH solo se valida lo que llega
  const shouldCheck = (field: string) => !partial || body[field] !== undefined;

  for (const field of TEXT_FIELDS) {
    if (!shouldCheck(field)) continue;

    const value = body[field];
    if (typeof value !== "string" || value.trim() === "") {
      errors[field] = "Debe ser un texto no vacío";
    }
  }

  // isSafeInteger rechaza valores enormes como 1e300 (isInteger los aceptaría)
  if (shouldCheck("pages") && (!Number.isSafeInteger(body.pages) || (body.pages as number) <= 0)) {
    errors.pages = "Debe ser un número entero mayor que 0";
  }

  // Los años negativos están permitidos (a. C.), los futuros no
  if (
    shouldCheck("year") &&
    (!Number.isSafeInteger(body.year) || (body.year as number) > new Date().getFullYear())
  ) {
    errors.year = "Debe ser un número entero no posterior al año actual";
  }

  return errors;
}

// Construye los datos del libro (sin id) a partir de un body ya validado
function toBookData(body: Query): BookData {
  return {
    // Se guarda recortado, igual que se valida
    author: (body.author as string).trim(),
    country: (body.country as string).trim(),
    imageLink: (body.imageLink as string).trim(),
    language: (body.language as string).trim(),
    link: (body.link as string).trim(),
    title: (body.title as string).trim(),
    pages: body.pages as number,
    year: body.year as number,
  };
}

/**
 * Construye solo los campos que llegan en un body de PATCH ya validado.
 * Los textos se guardan recortados, igual que en {@link toBookData}.
 *
 * @param body - Body ya validado con `validateBook(body, { partial: true })`.
 * @returns Los campos enviados, listos para mezclarlos con el libro existente.
 */
function toPartialBookData(body: Query): Partial<BookData> {
  const data: Partial<BookData> = {};

  for (const field of TEXT_FIELDS) {
    if (body[field] !== undefined) data[field] = (body[field] as string).trim();
  }

  if (body.pages !== undefined) data.pages = body.pages as number;
  if (body.year !== undefined) data.year = body.year as number;

  return data;
}

function matchesAllFilters(book: Book, query: Query): boolean {
  return (
    matchesText(book.author, query.author) &&
    matchesText(book.country, query.country) &&
    matchesText(book.language, query.language) &&
    matchesText(book.title, query.title) &&
    matchesText(book.link, query.link) &&
    matchesText(book.imageLink, query.imageLink) &&
    matchesNumber(book.pages, query, "pages") &&
    matchesNumber(book.year, query, "year")
  );
}

// "China" coincide con "chi", "CHI", "ina"...
function matchesText(bookValue: string, search: unknown): boolean {
  if (typeof search !== "string") return true;

  return bookValue.toLowerCase().includes(search.toLowerCase());
}

// Comprueba field, field_gt, field_gte, field_lt y field_lte
function matchesNumber(bookValue: number, query: Query, field: string): boolean {
  const equal = parseNumber(query[field]);
  const greaterThan = parseNumber(query[`${field}_gt`]);
  const greaterOrEqual = parseNumber(query[`${field}_gte`]);
  const lessThan = parseNumber(query[`${field}_lt`]);
  const lessOrEqual = parseNumber(query[`${field}_lte`]);

  if (equal !== undefined && bookValue !== equal) return false;
  if (greaterThan !== undefined && bookValue <= greaterThan) return false;
  if (greaterOrEqual !== undefined && bookValue < greaterOrEqual) return false;
  if (lessThan !== undefined && bookValue >= lessThan) return false;
  if (lessOrEqual !== undefined && bookValue > lessOrEqual) return false;

  return true;
}

function applyLimit(books: Book[], limitParam: unknown): Book[] {
  const limit = parseNumber(limitParam);
  if (limit === undefined || limit < 0) return books;

  return books.slice(0, limit);
}

// Devuelve undefined si el parámetro no viene, está en blanco o no es un número finito
// (Number(" ") sería 0 y Number("Infinity") sería Infinity)
function parseNumber(value: unknown): number | undefined {
  if (typeof value !== "string" || value.trim() === "") return undefined;

  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

// Solo acepta UUID válidos: rechaza "1", "abc", " 99d9de0b-..."
function parseId(raw: string): string | undefined {
  return validateUuid(raw) ? raw : undefined;
}

export default router;
