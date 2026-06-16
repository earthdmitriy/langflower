## Responsibility

The command-line interface for interacting with the system. It handles input parsing, configuration loading, and terminal output formatting.

## Key Folders

- `src/cli`: Command definitions and parser logic.
- `src/terminal`: Formatting helpers for colors, tables, and progress bars.

## Public Contracts

- `CommandParser`: Converts raw strings into executable commands.
- `OutputFormatter`: Standardizes how data is printed to the terminal.
- `ConfigLoader`: Reads `.json` or `.yaml` configuration files.

## Neighbor Interactions

- **CLI -> Runtime**: Passes command arguments and triggers execution.
- **Runtime -> CLI**: Provides status updates for progress bars and final results.

## Pitfalls

- Complex nested commands can be hard to parse; keep the hierarchy shallow.
- Ensure consistent naming conventions across all flags (e.g., `-v` vs `--verbose`).
