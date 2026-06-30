type AstrologerNavigationDrawerBrandTitleProps = {
  title: string;
};

export function AstrologerNavigationDrawerBrandTitle({
  title
}: AstrologerNavigationDrawerBrandTitleProps) {
  const accentStartIndex = title.indexOf("House");

  if (accentStartIndex === -1) {
    return title;
  }

  return (
    <>
      {title.slice(0, accentStartIndex)}
      <span className="ehNavigationDrawer__brandTitleAccent">
        {title.slice(accentStartIndex)}
      </span>
    </>
  );
}
