"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import type { FaqCategory } from "./types";
import styles from "./docs.module.css";

export function FaqGroup({ questions }: { questions: FaqCategory["questions"] }) {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function revealQuestion() {
      const id = window.location.hash.slice(1);
      const question = [...(container.current?.querySelectorAll('details') ?? [])].find(item => item.id === id);
      if (question) {
        question.open = true;
        question.scrollIntoView({ block: "start" });
      }
    }
    revealQuestion();
    window.addEventListener("hashchange", revealQuestion);
    return () => window.removeEventListener("hashchange", revealQuestion);
  }, []);

  return <div ref={container} className={styles.faqGroup}>
    {questions.map(item => <details key={item.id} id={item.id} className={styles.faqItem}>
      <summary>{item.question}<span aria-hidden="true">+</span>
      </summary>
      <div>
        <p>{item.answer}</p>
        <Link href={item.related}>Read the related guide <span aria-hidden="true">→</span>
        </Link>
        <a href={`#${item.id}`} aria-label={`Link to ${item.question}`}>Link to this answer #</a>
      </div>
    </details>)}
  </div>;
}
