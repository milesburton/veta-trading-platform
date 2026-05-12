# Incident log

Every incident gets its own file here. The format is timestamped (`YYYY-MM-DD-NN-short-name.md`) so the directory is naturally chronological.

The discipline:

1. **Every outage > 5 min user-visible impact gets an entry.** No exceptions, including overnight blips.
2. **Filed within 24 hours** of resolution. Memory fades; the value is in the action item.
3. **Action item is required.** "We'll do better" is not an action item. "Add test X by date Y" is.
4. **Blameless.** People are not named except as note-takers.

For incidents with MTTR > 30 min OR user-visible impact > 5 min, also write a postmortem in `postmortems/`.

See [`TEMPLATE.md`](./TEMPLATE.md) for the entry shape.
