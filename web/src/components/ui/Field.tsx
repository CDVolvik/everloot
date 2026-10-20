import type { InputHTMLAttributes, ReactNode } from "react";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  /** Ids, codes, links and numbers: Geist Mono. */
  mono?: boolean;
};

/** The one text input: control corners, the `edge` hairline, accent on focus. Label it with Field or an sr-only label. */
export function Input({ mono = false, className = "", ...rest }: InputProps) {
  return (
    <input
      {...rest}
      className={`w-full min-w-0 rounded-control border border-edge bg-canvas px-3 text-fg placeholder:text-muted focus:border-accent ${mono ? "font-mono" : ""} ${className}`.trim()}
    />
  );
}

/** A labelled text input for a tool's form: the label sits above the box. */
export default function Field({ label, ...rest }: InputProps & { label: ReactNode }) {
  return (
    <label className="block min-w-0 space-y-1 text-sm">
      <span className="block text-muted">{label}</span>
      <Input {...rest} />
    </label>
  );
}
