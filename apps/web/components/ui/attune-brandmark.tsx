import Image from 'next/image';

export function AttuneBrandmark({
  size = 24,
  className,
}: {
  readonly size?: number;
  readonly className?: string;
}) {
  return (
    <Image src="/favicon.svg" width={size} height={size} className={className} alt="" aria-hidden />
  );
}
