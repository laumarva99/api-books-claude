/**
 * Contrato del almacenamiento de libros.
 *
 * Las rutas solo conocen esta interfaz, no cómo se guardan los datos.
 * Para cambiar de almacenamiento (por ejemplo, de memoria a MongoDB) basta con
 * escribir otra clase que implemente `BooksStorage`; las rutas no cambian.
 *
 * Los métodos devuelven `Promise` aunque la versión en memoria no lo necesite:
 * así el contrato ya sirve para almacenamientos asíncronos como una base de datos.
 */

/** Un libro tal y como se guarda y se devuelve en la API. */
export interface Book {
  /** UUID asignado por el almacenamiento. */
  id: string;
  author: string;
  country: string;
  imageLink: string;
  language: string;
  link: string;
  pages: number;
  title: string;
  year: number;
}

/** Los datos de un libro sin el id (lo asigna el almacenamiento). */
export type BookData = Omit<Book, "id">;

export interface BooksStorage {
  /** Devuelve todos los libros. */
  findAll(): Promise<Book[]>;

  /**
   * Busca un libro por su id.
   * @returns El libro, o `undefined` si no existe.
   */
  findById(id: string): Promise<Book | undefined>;

  /**
   * Guarda un libro nuevo y le asigna un id (UUID).
   * @param data - Datos ya validados.
   * @returns El libro creado, con su id.
   */
  create(data: BookData): Promise<Book>;

  /**
   * Sustituye por completo los datos de un libro (PUT). El id no cambia.
   * @returns El libro sustituido, o `undefined` si no existe.
   */
  replace(id: string, data: BookData): Promise<Book | undefined>;

  /**
   * Modifica solo los campos recibidos de un libro (PATCH). El id no cambia.
   * @returns El libro modificado, o `undefined` si no existe.
   */
  update(id: string, data: Partial<BookData>): Promise<Book | undefined>;

  /**
   * Borra un libro.
   * @returns El libro borrado, o `undefined` si no existía.
   */
  remove(id: string): Promise<Book | undefined>;
}
