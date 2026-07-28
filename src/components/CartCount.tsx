"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CART_EVENT, readCart } from "@/lib/cartStorage";

/** Cart badge. Listens for the custom event so adding an item updates it live. */
export default function CartCount() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const sync = () => setCount(readCart().reduce((n, l) => n + l.qty, 0));
    sync();
    window.addEventListener(CART_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CART_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return (
    <Link
      href="/cart"
      style={{ textDecoration: "none", color: "var(--ember)", whiteSpace: "nowrap" }}
    >
      Cart{count > 0 ? ` (${count})` : ""}
    </Link>
  );
}
