import type { Question } from "../types";

interface QuestionFigureProps {
  question: Question;
}

export function QuestionFigure({ question }: QuestionFigureProps) {
  if (!question.image) {
    return null;
  }

  const imagePath = question.image.replace(/^\/+/, "");
  const imageUrl = /^https?:\/\//i.test(question.image)
    ? question.image
    : `${import.meta.env.BASE_URL}${imagePath}`;

  return (
    <figure className="question-figure">
      <img alt={question.imageAlt ?? `${question.id} 题图`} loading="lazy" src={imageUrl} />
      {question.imageAlt && <figcaption>{question.imageAlt}</figcaption>}
    </figure>
  );
}