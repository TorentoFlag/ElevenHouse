import { useEffect, useState } from "react";
import { useDocumentTitle } from "../../common/hooks/useDocumentTitle";
import {
  getClientBirthData,
  getRelatedAstrologers,
  upsertClientBirthData
} from "../../features/client-profile/api/clientProfileApi";

type RelatedAstrologer = {
  readonly astrologerUserId: string;
  readonly publicHandle: string;
  readonly publicName: string;
};

export function MePage() {
  const [astrologers, setAstrologers] = useState<readonly RelatedAstrologer[]>([]);
  const [birthDate, setBirthDate] = useState("");
  const [birthTime, setBirthTime] = useState("");
  const [birthPlaceText, setBirthPlaceText] = useState("");
  const [status, setStatus] = useState<"loading" | "ready" | "saving" | "saved" | "error">(
    "loading"
  );

  useDocumentTitle("Me");

  useEffect(() => {
    let cancelled = false;

    Promise.all([getRelatedAstrologers(), getClientBirthData()])
      .then(([related, birthData]) => {
        if (cancelled) return;
        setAstrologers(related.astrologers);
        setBirthDate(birthData?.birthDate ?? "");
        setBirthTime(birthData?.birthTime ?? "");
        setBirthPlaceText(birthData?.birthPlaceText ?? "");
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("saving");

    try {
      const saved = await upsertClientBirthData({
        label: null,
        birthDate: birthDate || null,
        birthTime: birthTime || null,
        birthTimePrecision: birthTime ? "exact" : "unknown",
        birthPlaceText: birthPlaceText || null,
        birthCountryCode: null,
        birthCity: null,
        birthRegion: null,
        birthTimezone: null,
        birthLatitude: null,
        birthLongitude: null
      });
      setBirthDate(saved.birthDate ?? "");
      setBirthTime(saved.birthTime ?? "");
      setBirthPlaceText(saved.birthPlaceText ?? "");
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  }

  if (status === "loading") {
    return <main aria-busy="true">Загружаем профиль...</main>;
  }

  return (
    <main>
      <h1>Профиль клиента</h1>
      <section>
        <h2>Мои астрологи</h2>
        {astrologers.length === 0 ? (
          <p>Пока нет связанных астрологов.</p>
        ) : (
          <ul>
            {astrologers.map((astrologer) => (
              <li key={astrologer.astrologerUserId}>
                {astrologer.publicName} @{astrologer.publicHandle}
              </li>
            ))}
          </ul>
        )}
      </section>

      <form onSubmit={handleSubmit}>
        <h2>Данные рождения</h2>
        <label>
          Дата рождения
          <input
            type="date"
            value={birthDate}
            onChange={(event) => setBirthDate(event.target.value)}
          />
        </label>
        <label>
          Время рождения
          <input
            type="time"
            value={birthTime}
            onChange={(event) => setBirthTime(event.target.value)}
          />
        </label>
        <label>
          Место рождения
          <input
            value={birthPlaceText}
            onChange={(event) => setBirthPlaceText(event.target.value)}
          />
        </label>
        <button type="submit" disabled={status === "saving"}>
          Сохранить
        </button>
        {status === "saved" ? <p>Сохранено</p> : null}
        {status === "error" ? <p>Не удалось выполнить действие</p> : null}
      </form>
    </main>
  );
}
