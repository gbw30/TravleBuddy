import { field } from "./styles";

/** A native select used as a "do this with…" menu: keyboard and phone friendly. */
export function MoveMenu({
  label,
  placeholder,
  options,
  onChoose,
}: {
  label: string;
  placeholder: string;
  options: { value: string; label: string }[];
  onChoose: (value: string) => void;
}) {
  return (
    <select
      aria-label={label}
      value=""
      onChange={(event) => event.target.value && onChoose(event.target.value)}
      className={`${field} max-w-28`}
    >
      <option value="">{placeholder}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
