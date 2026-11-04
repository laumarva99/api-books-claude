import { MongoClient, type Collection, type WithId } from "mongodb";
import { v4 as uuidv4 } from "uuid";
import type { Book, BookData, BooksStorage } from "./books-storage";

/**
 * Un libro tal y como se guarda en MongoDB: el UUID es el propio `_id`
 * del documento, así no hay dos ids. Hacia fuera se expone como `id`.
 */
type BookDocument = BookData & { _id: string };

const COLLECTION_NAME = "books";

/**
 * Almacenamiento de libros en MongoDB.
 *
 * Usa `MONGODB_URI` y `DB_NAME` del `.env` (los carga `npm run dev`).
 * La conexión se abre la primera vez que se necesita y se reutiliza.
 */
export class BooksStorageInNoSQL implements BooksStorage {
  private readonly client: MongoClient;
  private readonly dbName: string;
  private connection?: Promise<MongoClient>;

  constructor(uri = process.env.MONGODB_URI, dbName = process.env.DB_NAME ?? "books_api") {
    if (!uri) {
      throw new Error("Falta la variable de entorno MONGODB_URI");
    }

    this.client = new MongoClient(uri);
    this.dbName = dbName;
  }

  async findAll(): Promise<Book[]> {
    const collection = await this.collection();
    const documents = await collection.find().toArray();

    return documents.map(toBook);
  }

  async findById(id: string): Promise<Book | undefined> {
    const collection = await this.collection();

    return toBookOrUndefined(await collection.findOne({ _id: id }));
  }

  /** El id es un UUID v4 nuevo, que se guarda como `_id` del documento. */
  async create(data: BookData): Promise<Book> {
    const collection = await this.collection();
    const id = uuidv4();

    await collection.insertOne({ _id: id, ...data });
    return { id, ...data };
  }

  async replace(id: string, data: BookData): Promise<Book | undefined> {
    const collection = await this.collection();
    const replaced = await collection.findOneAndReplace({ _id: id }, data, {
      returnDocument: "after",
    });

    return toBookOrUndefined(replaced);
  }

  async update(id: string, data: Partial<BookData>): Promise<Book | undefined> {
    const collection = await this.collection();
    const updated = await collection.findOneAndUpdate(
      { _id: id },
      { $set: data },
      { returnDocument: "after" },
    );

    return toBookOrUndefined(updated);
  }
  

  async remove(id: string): Promise<Book | undefined> {
    const collection = await this.collection();

    return toBookOrUndefined(await collection.findOneAndDelete({ _id: id }));
  }

  /**
   * Devuelve la colección de libros, conectando solo la primera vez.
   * Se guarda la promesa (no el cliente) para que varias peticiones
   * simultáneas no abran varias conexiones. Si falla, se reintenta en la siguiente.
   */
  private async collection(): Promise<Collection<BookDocument>> {
    this.connection ??= this.client.connect().catch((error: unknown) => {
      this.connection = undefined;
      throw error;
    });

    const client = await this.connection;
    return client.db(this.dbName).collection<BookDocument>(COLLECTION_NAME);
  }
}

// `_id` (Mongo) -> `id` (API)
function toBook({ _id, ...data }: WithId<BookDocument>): Book {
  return { id: _id, ...data };
}

// El driver devuelve `null` si no encuentra nada; el contrato usa `undefined`
function toBookOrUndefined(document: WithId<BookDocument> | null): Book | undefined {
  return document ? toBook(document) : undefined;
}
