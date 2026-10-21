# foliate-js vendorizado

- Origem: https://github.com/johnfactotum/foliate-js
- Commit: 78914aef4466eb960965702401634c2cb348e9b1 (Fri May 1 19:24:25 2026 +0000)
- Licença: MIT (LICENSE). zip.js: BSD-3-Clause. fflate: MIT.

Mudanças locais:
- `pdf.js` trocado por um stub (o original importa `vendor/pdfjs`, que não vem no repositório).
- `view.js`: o evento `relocate` leva o `reason` do renderer (page, snap, scroll, anchor, navigation,
  selection); o leitor usa para saber se a posição mudou por você ou pelo layout.
- Ficaram de fora: `reader.html`, `reader.js`, `ui/`, `dict.js`, `opds.js`, `quote-image.js`, `uri-template.js`, testes.
