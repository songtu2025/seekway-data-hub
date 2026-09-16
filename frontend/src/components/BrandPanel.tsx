import { PRODUCT_NAME } from "../config/product";

export function BrandPanel() {
  return (
    <header className="brand-panel">
      <div className="brand-lockup">
        <img
          alt=""
          aria-hidden="true"
          className="brand-mark brand-mark--light brand-mark--image"
          src="/favicon.svg"
        />
        <span>{PRODUCT_NAME}</span>
      </div>
    </header>
  );
}
