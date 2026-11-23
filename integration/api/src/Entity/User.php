<?php

namespace App\Entity;

use ApiPlatform\Doctrine\Orm\Filter\OrderFilter;
use ApiPlatform\Doctrine\Orm\Filter\SearchFilter;
use ApiPlatform\Metadata\ApiFilter;
use ApiPlatform\Metadata\ApiResource;
use ApiPlatform\Serializer\Filter\PropertyFilter;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity]
#[ApiResource]
#[ApiFilter(SearchFilter::class, properties: ['name' => 'partial', 'company' => 'exact'])]
#[ApiFilter(OrderFilter::class, properties: ['name'])]
#[ApiFilter(PropertyFilter::class)]
class User
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\Column]
    public string $name = '';

    #[ORM\Column]
    public string $email = '';

    #[ORM\ManyToOne]
    public ?Company $company = null;

    public function getId(): ?int
    {
        return $this->id;
    }
}
