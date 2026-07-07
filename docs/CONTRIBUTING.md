# Contributing Guidelines

Thank you for considering contributing to the Email Verification System!  
Please read the following guidelines to help make the process smooth and effective.

## How to Contribute

1. **Fork the repository** on GitHub.
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/your-username/email-verifier.git
   cd email-verifier/email-verifier
   ```
3. **Create a branch** for your work:
   ```bash
   git checkout -b feature/or-improvement-name
   ```
   Use descriptive names (`fix/issue-number`, `docs/readme-update`, etc.).
4. **Make your changes**, following the coding style and conventions described below.
5. **Add or update tests** as appropriate.
6. **Ensure all tests pass** (see “Running Tests”).
7. **Commit your changes** with a clear, conventional commit message:
   - `feat:` for new features
   - `fix:` for bug fixes
   - `docs:` for documentation changes
   - `refactor:` for code refactors
   - `test:` for test additions/changes
   - `chore:` for maintenance tasks
8. **Push to your fork** and open a Pull Request (PR) against the `main` branch.
9. **Fill out the PR template** (if present) describing what was changed and why.
10. **Respond to reviewer feedback** promptly.

## Code Style

### Python
- Follow **PEP 8**.
- Use **Black** for code formatting (`black .`).
- Use **Flake8** or **ruff** for linting (`flake8 .`).
- Type hints are encouraged (PEP 484) and checked with `mypy` if configured.
- Keep functions small and focused; aim for < 40 lines when possible.

### JavaScript / JSX
- Follow the project’s **ESLint** and **Prettier** configuration.
- Use functional components with hooks where applicable.
- Keep component files < 200 lines; split complex UI into smaller components.
- Name components in PascalCase, files matching component name (`MyComponent.jsx`).

### Commit Messages
- Use the **conventional commits** format (see https://www.conventionalcommits.org).
- Reference issues when applicable: `fix: resolve email validation bug (#42)`.

## Reporting Issues
- Use the GitHub Issues tracker.
- Provide:
  - Clear title and description.
  - Steps to reproduce (if bug).
  - Expected vs. actual behavior.
  - Environment details (Docker version, OS, any custom config).
  - Relevant logs or screenshots.
- Check existing issues to avoid duplicates.

## Review Process
- At least one maintainer must approve the PR.
- CI checks (tests, linting) must pass.
- Avoid large PRs; if a change is large, consider splitting into logical parts.
- Once approved, a maintainer will merge the PR using **Squash and Merge** to keep a clean history.

## Licensing
By contributing, you agree that your contributions will be licensed under the project’s chosen license (see LICENSE file).

## Questions?
Feel free to ask in the project’s discussion forum or contact the maintainers.

Happy coding! 🚀