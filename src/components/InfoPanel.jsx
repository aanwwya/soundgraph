import {
  getDescriptionParagraphs,
  getNeighborRecords,
  getRecordsByIds,
} from "../utils/graphUtils.js";

function typeLine(record) {
  if (record.type === "genre") {
    return [record.origin].filter(Boolean).join(" · ");
  }

  if (record.type === "album") {
    return [record.year, "album"].filter(Boolean).join(" · ");
  }

  return "";
}

function RichText({ text }) {
  const parts = String(text).split(/(\*[^*]+\*)/g);

  return parts.map((part, index) => {
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return <em key={`${part}-${index}`}>{part.slice(1, -1)}</em>;
    }

    return <span key={`${part}-${index}`}>{part}</span>;
  });
}

function LinkList({ records, onSelect }) {
  if (!records.length) return null;

  return (
    <ul className="info-panel__links">
      {records.map((item) => (
        <li key={item.id}>
          <button type="button" onClick={() => onSelect(item.id)}>
            {item.name}
          </button>
        </li>
      ))}
    </ul>
  );
}

function ConnectedGenres({ record, onSelect }) {
  const genres = getRecordsByIds(record.genres ?? []);
  if (!genres.length) return null;

  return (
    <section className="info-panel__section info-panel__section--connected">
      <h3>connected</h3>
      <LinkList records={genres} onSelect={onSelect} />
    </section>
  );
}

function Description({ paragraphs }) {
  return paragraphs.map((paragraph) => (
    <p key={paragraph.slice(0, 24)} className="info-panel__body">
      <RichText text={paragraph} />
    </p>
  ));
}

export default function InfoPanel({ record, onSelect, onClose }) {
  if (!record) {
    return null;
  }

  const paragraphs = getDescriptionParagraphs(record);
  const artists = getRecordsByIds(record.importantArtists);
  const neighbors = getNeighborRecords(record.id);
  const isGenre = record.type === "genre";
  const isArtist = record.type === "artist";
  const meta = typeLine(record);
  const listenHref = record.artistUrl || record.playlistUrl;
  const listenLabel = record.artistUrl
    ? "artist ↗"
    : isGenre
      ? `${record.name} playlist ↗`
      : "open playlist ↗";

  return (
    <aside className="info-panel" aria-label={`${record.name} note`}>
      <button type="button" className="info-panel__close" onClick={onClose}>
        close
      </button>

      <p className="info-panel__kind">{record.type}</p>
      <h2 className="info-panel__title">{record.name}</h2>
      {meta ? <p className="info-panel__meta">{meta}</p> : null}

      {isArtist ? <ConnectedGenres record={record} onSelect={onSelect} /> : null}

      <Description paragraphs={paragraphs} />

      {isArtist ? null : record.history?.length ? (
        <section className="info-panel__section">
          <h3>history</h3>
          <ol className="timeline">
            {record.history.map((entry) => (
              <li key={`${entry.year}-${entry.event}`}>
                <span className="timeline__year">{entry.year}</span>
                <span className="timeline__event">{entry.event}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {isGenre && artists.length > 0 ? (
        <section className="info-panel__section">
          <h3>artists</h3>
          <LinkList records={artists} onSelect={onSelect} />
        </section>
      ) : null}

      {!isGenre && !isArtist && neighbors.length > 0 ? (
        <section className="info-panel__section">
          <h3>connected</h3>
          <LinkList records={neighbors} onSelect={onSelect} />
        </section>
      ) : null}

      {listenHref ? (
        <section className="info-panel__section">
          <h3>listen</h3>
          <p className="info-panel__listen">
            <span aria-hidden="true">♫</span>
            <a href={listenHref} target="_blank" rel="noreferrer">
              {listenLabel}
            </a>
          </p>
        </section>
      ) : null}
    </aside>
  );
}
