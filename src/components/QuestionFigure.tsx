import type { Question } from "../types";

interface QuestionFigureProps {
  question: Question;
}

export function QuestionFigure({ question }: QuestionFigureProps) {
  if (!question.image) {
    return null;
  }

  return (
    <ImageFigure
      alt={question.imageAlt ?? `${question.id} 题图`}
      caption={question.imageAlt}
      className="question-figure"
      image={question.image}
    />
  );
}

export function SolutionFigure({ question }: QuestionFigureProps) {
  if (!question.solutionImage) {
    return null;
  }

  return (
    <ImageFigure
      alt={question.solutionImageAlt ?? `${question.id} 答案图`}
      caption={question.solutionImageAlt}
      className="question-figure solution-figure"
      image={question.solutionImage}
    />
  );
}

function ImageFigure({
  alt,
  caption,
  className,
  image,
}: {
  alt: string;
  caption?: string;
  className: string;
  image: string;
}) {
  const imagePath = image.replace(/^\/+/, "");
  const imageUrl = /^https?:\/\//i.test(image)
    ? image
    : `${import.meta.env.BASE_URL}${imagePath}`;

  return (
    <figure className={className}>
      <img alt={alt} loading="lazy" src={imageUrl} />
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}
