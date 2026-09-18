const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const editHtml = fs.readFileSync(path.join(root, "admin/faktura-rediger.html"), "utf8");
const editJs = fs.readFileSync(path.join(root, "admin/faktura-rediger.js"), "utf8");
const detailHtml = fs.readFileSync(path.join(root, "admin/faktura-detalj.html"), "utf8");
const detailJs = fs.readFileSync(path.join(root, "admin/faktura-detalj.js"), "utf8");
const css = fs.readFileSync(path.join(root, "admin/admin-pages.css"), "utf8");

test("fakturautkast har prosent og fast kunderabatt", () => {
  assert.match(editHtml, /id="discount"/);
  assert.match(editHtml, /id="discountType"/);
  assert.match(editHtml, /value="percent">Prosent/);
  assert.match(editHtml, /value="fixed">Fast beløp/);
  assert.match(editHtml, /id="discountLabel"/);
  assert.match(editHtml, /Rabatten vises tydelig på fakturaen/);
});

test("rabatt beregnes i live preview uten å endre fakturalinjene", () => {
  assert.match(editJs, /function discountFor\(gross\)/);
  assert.match(editJs, /Sum før rabatt:/);
  assert.match(editJs, /Kunden får rabatt/);
  assert.match(editJs, /Du sparer kunden/);
  assert.match(editJs, /discountType: discount\.type/);
  assert.match(editJs, /discountValue: discount\.value/);
  assert.match(editJs, /discountLabel:/);
});

test("fakturadetalj viser rabatten tydelig og har direkte Gi rabatt-knapp", () => {
  assert.match(detailJs, /function discountMarkup\(inv\)/);
  assert.match(detailJs, /Kunden har fått rabatt/);
  assert.match(detailJs, /Du sparer:/);
  assert.match(detailJs, /Gi rabatt/);
  assert.match(detailJs, /Endre rabatt/);
  assert.match(detailJs, /faktura-rediger\.html\?id=.*#discount/);
  assert.match(css, /\.fd-discount/);
  assert.match(css, /\.btn-discount/);
});

test("cache er bustet for rabattversjonen", () => {
  assert.match(editHtml, /faktura-rediger\.js\?v=20260919-discount1/);
  assert.match(detailHtml, /faktura-detalj\.js\?v=20260919-discount1/);
  assert.match(editHtml, /admin-pages\.css\?v=20260919-discount1/);
  assert.match(detailHtml, /admin-pages\.css\?v=20260919-discount1/);
});
