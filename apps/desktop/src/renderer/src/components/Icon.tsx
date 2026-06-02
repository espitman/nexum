type IconProps = {
  name: string;
};

export const Icon = ({ name }: IconProps) => (
  <span className={`icon icon-${name}`} />
);
