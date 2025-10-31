import { Title, type TitleProps, useMantineColorScheme } from '@mantine/core';

type PageTitleProps = TitleProps & {
  /**
   * Optional flag to disable the light-mode override; useful for edge cases.
   */
  disableLightOverride?: boolean;
};

export function PageTitle({
  children,
  style,
  disableLightOverride = false,
  ...rest
}: PageTitleProps) {
  const { colorScheme } = useMantineColorScheme();

  const lightModeStyles =
    colorScheme === 'light' && !disableLightOverride
      ? { color: '#616161', textShadow: '-1px 1px 1px #b6b6b6' }
      : {};

  return (
    <Title
      {...rest}
      style={{
        ...lightModeStyles,
        ...style,
      }}
    >
      {children}
    </Title>
  );
}
