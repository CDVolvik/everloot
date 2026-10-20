export interface SearchBarProps {
  /** Where the form goes, with the query as `?q=`. */
  action: string;
  /** What the field searches, for screen readers: "Search the database". */
  label: string;
  placeholder?: string;
  defaultValue?: string;
  /** Unique on the page. */
  id?: string;
  /** One short line under the field: what can be typed. */
  hint?: string;
}

/**
 * The large search field a page leads with: a plain GET form, so it works without JavaScript. The header
 * keeps its own small field; this one is for a page whose first job is finding something.
 */
export default function SearchBar({ action, label, placeholder, defaultValue = "", id = "page-search", hint }: SearchBarProps) {
  return (
    <form action={action} method="get" role="search" data-search-bar className="min-w-0">
      <div className="flex min-w-0 gap-2">
        <label htmlFor={id} className="sr-only">{label}</label>
        <input
          id={id}
          name="q"
          type="search"
          defaultValue={defaultValue}
          maxLength={200}
          placeholder={placeholder}
          aria-describedby={hint ? `${id}-hint` : undefined}
          className="h-14 min-w-0 flex-1 rounded-control border border-edge bg-panel px-4 text-lg text-fg placeholder:text-muted focus:border-accent focus:outline-none"
        />
        <button type="submit" className="btn btn-primary h-14 shrink-0">Search</button>
      </div>
      {hint && <p id={`${id}-hint`} className="mt-2 text-sm text-muted">{hint}</p>}
    </form>
  );
}
