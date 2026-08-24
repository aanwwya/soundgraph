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

function ExternalArrow() {
  return (
    <svg
      className="listen-arrow"
      viewBox="0 0 12 12"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M3 9L9 3M5 3h4v4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function getListenLinks(record, isGenre) {
  if (record.artistUrl) {
    return [{ href: record.artistUrl, label: "artist" }];
  }

  if (Array.isArray(record.playlists) && record.playlists.length) {
    return record.playlists;
  }

  if (record.playlistUrl) {
    return [
      {
        href: record.playlistUrl,
        label: isGenre ? `${record.name} playlist` : "open playlist",
      },
    ];
  }

  return [];
}

function ListenLinks({ links }) {
  if (!links.length) return null;

  return links.map((link) => (
    <p key={link.href} className="info-panel__listen">
      <span aria-hidden="true">♫</span>
      <a href={link.href} target="_blank" rel="noreferrer">
        {link.label}
        <ExternalArrow />
      </a>
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
  const listenLinks = getListenLinks(record, isGenre);

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

      {record.exploreTheScene ? (
        <section className="info-panel__section">
          <h3>explore the scene</h3>
          <LinkList
            records={getRecordsByIds(record.relatedGenres)}
            onSelect={onSelect}
          />
        </section>
      ) : null}

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

      {artists.length > 0 ? (
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

      {listenLinks.length ? (
        <section className="info-panel__section">
          <h3>listen</h3>
          <ListenLinks links={listenLinks} />
        </section>
      ) : null}
    </aside>
  );
}
