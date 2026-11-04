import { v4 as uuidv4 } from "uuid";
import booksData from "../data/books.json";
import type { Book, BookData, BooksStorage } from "./books-storage";

/**
 * Almacenamiento de libros en memoria.
 *
 * Arranca con los libros de `data/books.json`. Los cambios se pierden al
 * reiniciar el servidor.
 */
export class BooksStorageInMemory implements BooksStorage {
  private books: Book[] = [...booksData];

  async findAll(): Promise<Book[]> {
    // Copia: quien la reciba no puede modificar el almacenamiento desde fuera
    return [...this.books];
  }

  async findById(id: string): Promise<Book | undefined> {
    return this.books.find((book) => book.id === id);
  }

  /** El id es un UUID v4 nuevo: nunca se repite, aunque se borren libros. */
  async create(data: BookData): Promise<Book> {
    const newBook: Book = { id: uuidv4(), ...data };

    this.books.push(newBook);
    return newBook;
  }

  async replace(id: string, data: BookData): Promise<Book | undefined> {
    const index = this.findIndex(id);
    if (index === -1) return undefined;

    const replacedBook: Book = { id, ...data };

    this.books[index] = replacedBook;
    return replacedBook;
  }

  async update(id: string, data: Partial<BookData>): Promise<Book | undefined> {
    const index = this.findIndex(id);
    if (index === -1) return undefined;

    // El id va al final para que nunca se pueda sobrescribir
    const updatedBook: Book = { ...this.books[index], ...data, id };

    this.books[index] = updatedBook;
    return updatedBook;
  }

  async remove(id: string): Promise<Book | undefined> {
    const index = this.findIndex(id);
    if (index === -1) return undefined;

    const [removedBook] = this.books.splice(index, 1);
    return removedBook;
  }

  private findIndex(id: string): number {
    return this.books.findIndex((book) => book.id === id);
  }
}
