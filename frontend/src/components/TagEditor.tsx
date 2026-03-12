interface TagEditorProps {
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
}

export function TagEditor({ label, value, onChange }: TagEditorProps) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="text"
        value={value.join(", ")}
        onChange={(event) =>
          onChange(
            event.target.value
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean)
          )
        }
      />
    </label>
  );
}
